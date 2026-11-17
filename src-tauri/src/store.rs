use serde::Deserialize;
use sqlx::{Row, SqlitePool};
use tauri::{AppHandle, Manager};
use tauri_plugin_sql::{DbInstances, DbPool};
use uuid::Uuid;

#[cfg(test)]
#[path = "store_tests.rs"]
mod tests;

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Action {
    #[serde(rename_all = "camelCase")]
    SavePrompt { id: Option<String>, content: String, tags: Vec<String>, category_ids: Vec<String> },
    DeletePrompt { id: String },
    ToggleFavorite { id: String },
    #[serde(rename_all = "camelCase")]
    Reorder { category_id: String, ids: Vec<String> },
    SaveCategory { id: Option<String>, name: String },
    DeleteCategory { id: String },
}

pub async fn pool(app: &AppHandle) -> Result<SqlitePool, String> {
    let instances = app.state::<DbInstances>();
    let guard = instances.0.read().await;
    match guard.get("sqlite:promptnote.db") {
        Some(DbPool::Sqlite(pool)) => Ok(pool.clone()),
        _ => Err("数据库尚未加载".into()),
    }
}

#[tauri::command]
pub async fn mutate_library(app: AppHandle, action: Action) -> Result<(), String> {
    let result = apply(&pool(&app).await?, action).await;
    if let Err(error) = &result { eprintln!("数据库事务失败：{error}"); }
    result
}

// 所有关系更新在同一事务连接执行，任一步失败即回滚。
async fn apply(pool: &SqlitePool, action: Action) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let result: Result<(), sqlx::Error> = async {
        match action {
            Action::SavePrompt { id, content, tags, category_ids } => {
                save_prompt(&mut tx, id, content, tags, category_ids).await?;
            }
            Action::DeletePrompt { id } => {
                sqlx::query("DELETE FROM prompt_tags WHERE prompt_id=?").bind(&id).execute(&mut *tx).await?;
                let changed = sqlx::query("DELETE FROM prompts WHERE id=?").bind(&id).execute(&mut *tx).await?;
                if changed.rows_affected() != 1 { return Err(sqlx::Error::RowNotFound); }
            }
            Action::ToggleFavorite { id } => {
                let changed = sqlx::query("UPDATE prompts SET is_favorite=1-is_favorite WHERE id=?").bind(id).execute(&mut *tx).await?;
                if changed.rows_affected() != 1 { return Err(sqlx::Error::RowNotFound); }
            }
            Action::Reorder { category_id, ids } => {
                let actual: Vec<String> = sqlx::query_scalar("SELECT id FROM prompts WHERE category_id=?")
                    .bind(&category_id).fetch_all(&mut *tx).await?;
                let requested: std::collections::BTreeSet<_> = ids.iter().collect();
                let current: std::collections::BTreeSet<_> = actual.iter().collect();
                if requested != current || requested.len() != ids.len() {
                    return Err(sqlx::Error::Protocol("排序必须完整且仅包含当前分类".into()));
                }
                for (position, id) in ids.iter().enumerate() {
                    sqlx::query("UPDATE prompts SET position=? WHERE id=? AND category_id=?")
                        .bind(position as i64).bind(id).bind(&category_id).execute(&mut *tx).await?;
                }
            }
            Action::SaveCategory { id, name } => {
                let name = name.trim();
                if name.is_empty() || name.chars().count() > 80 || id.as_deref() == Some("general") {
                    return Err(sqlx::Error::Protocol("分类名称无效或默认分类不可重命名".into()));
                }
                let duplicate: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM categories WHERE lower(name)=lower(?) AND id<>?")
                    .bind(name).bind(id.as_deref().unwrap_or("")).fetch_one(&mut *tx).await?;
                if duplicate > 0 { return Err(sqlx::Error::Protocol("分类名称重复".into())); }
                if let Some(id) = id {
                    let changed = sqlx::query("UPDATE categories SET name=? WHERE id=?").bind(name).bind(id).execute(&mut *tx).await?;
                    if changed.rows_affected() != 1 { return Err(sqlx::Error::RowNotFound); }
                } else {
                    sqlx::query("INSERT INTO categories(id,name,position) SELECT ?,?,COALESCE(MAX(position),-1)+1 FROM categories")
                        .bind(Uuid::now_v7().to_string()).bind(name).execute(&mut *tx).await?;
                }
            }
            Action::DeleteCategory { id } => {
                if id == "general" { return Err(sqlx::Error::Protocol("默认分类不可删除".into())); }
                // 同一事务内只删除当前分类的独立副本及关联，保留其他分类仍在使用的标签。
                sqlx::query("DELETE FROM prompt_tags WHERE prompt_id IN (SELECT id FROM prompts WHERE category_id=?)")
                    .bind(&id).execute(&mut *tx).await?;
                sqlx::query("DELETE FROM prompts WHERE category_id=?").bind(&id).execute(&mut *tx).await?;
                let changed = sqlx::query("DELETE FROM categories WHERE id=?").bind(id).execute(&mut *tx).await?;
                if changed.rows_affected() != 1 { return Err(sqlx::Error::RowNotFound); }
            }
        }
        sqlx::query("DELETE FROM tags WHERE NOT EXISTS(SELECT 1 FROM prompt_tags WHERE tag_id=tags.id)").execute(&mut *tx).await?;
        Ok(())
    }.await;
    result.map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())
}

// 提示词保存独立成一个事务内操作，避免动作分发函数承载关系构建细节。
async fn save_prompt(connection: &mut sqlx::SqliteConnection, id: Option<String>,
    content: String, tags: Vec<String>, category_ids: Vec<String>) -> Result<(), sqlx::Error> {
    if content.trim().is_empty() || content.chars().count() > 100_000
        || category_ids.is_empty() || category_ids.len() > 200
        // 标签不限制字数，与前端一致保留数量和非空校验。
        || tags.len() > 20 || tags.iter().any(|t| t.trim().is_empty()) {
        return Err(sqlx::Error::Protocol("提示词输入无效".into()));
    }
    let categories: std::collections::BTreeSet<_> = category_ids.into_iter().collect();
    let existing = if let Some(ref prompt_id) = id {
        Some(sqlx::query("SELECT category_id, is_favorite FROM prompts WHERE id=?")
            .bind(prompt_id).fetch_one(&mut *connection).await?)
    } else { None };
    // 原分类仍被勾选则在原位编辑，否则移到选中的首个分类。
    let original_category: Option<String> = existing.as_ref().map(|r| r.get("category_id"));
    let primary = original_category.as_ref().filter(|c| categories.contains(*c))
        .cloned().unwrap_or_else(|| categories.first().expect("已验证非空").clone());
    for category in &categories {
        sqlx::query("SELECT id FROM categories WHERE id=?").bind(category).fetch_one(&mut *connection).await?;
        let is_original = id.is_some() && category == &primary;
        let prompt_id = if is_original { id.clone().expect("已验证存在") } else { Uuid::now_v7().to_string() };
        let position: i64 = sqlx::query_scalar("SELECT COALESCE(MAX(position),-1)+1 FROM prompts WHERE category_id=?")
            .bind(category).fetch_one(&mut *connection).await?;
        if is_original {
            sqlx::query("UPDATE prompts SET content=?, category_id=?, position=CASE WHEN category_id=? THEN position ELSE ? END, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?")
                .bind(&content).bind(category).bind(category).bind(position).bind(&prompt_id).execute(&mut *connection).await?;
            sqlx::query("DELETE FROM prompt_tags WHERE prompt_id=?").bind(&prompt_id).execute(&mut *connection).await?;
        } else {
            let favorite: i64 = existing.as_ref().map(|r| r.get("is_favorite")).unwrap_or(0);
            sqlx::query("INSERT INTO prompts(id,content,category_id,position,is_favorite,created_at,updated_at) VALUES(?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'))")
                .bind(&prompt_id).bind(&content).bind(category).bind(position).bind(favorite).execute(&mut *connection).await?;
        }
        for tag in &tags {
            let name = tag.trim();
            let found: Option<String> = sqlx::query_scalar("SELECT id FROM tags WHERE name=? LIMIT 1")
                .bind(name).fetch_optional(&mut *connection).await?;
            let tag_id = found.unwrap_or_else(|| Uuid::now_v7().to_string());
            sqlx::query("INSERT OR IGNORE INTO tags(id,name,color) VALUES(?,?,'#14786a')")
                .bind(&tag_id).bind(name).execute(&mut *connection).await?;
            sqlx::query("INSERT OR IGNORE INTO prompt_tags(prompt_id,tag_id) VALUES(?,?)")
                .bind(&prompt_id).bind(&tag_id).execute(&mut *connection).await?;
        }
    }
    Ok(())
}
