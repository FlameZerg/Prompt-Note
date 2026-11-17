use std::collections::HashMap;
use serde::Serialize;
use sqlx::{Row, SqlitePool};
use tauri::AppHandle;

#[derive(Serialize)]
pub struct Library { categories: Vec<Category>, prompts: Vec<Prompt> }
#[derive(Serialize)]
struct Category { id: String, name: String, position: i64 }
#[derive(Serialize)]
struct Tag { id: String, name: String, color: String }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Prompt {
    id: String, content: String, category_id: String, position: i64,
    is_favorite: bool, date_created: String, date_modified: String, tags: Vec<Tag>,
}

// 不接受前端 SQL，避免插件 select 经 UPDATE RETURNING 绕过事务写入边界。
#[tauri::command]
pub async fn get_library(app: AppHandle) -> Result<Library, String> {
    let pool = crate::store::pool(&app).await?;
    read_library(&pool).await.map_err(|error| {
        eprintln!("读取本地提示词失败：{error}");
        error.to_string()
    })
}

async fn read_library(pool: &SqlitePool) -> Result<Library, sqlx::Error> {
    // 同一读取事务保持分类、提示词和标签的一致快照；写入仍由独立事务完成。
    let mut tx = pool.begin().await?;
    let rows = sqlx::query("SELECT id, name, position FROM categories ORDER BY position, id")
        .fetch_all(&mut *tx).await?;
    let categories = rows.iter().map(|row| Ok(Category {
        id: row.try_get("id")?, name: row.try_get("name")?, position: row.try_get("position")?,
    })).collect::<Result<Vec<_>, sqlx::Error>>()?;
    let rows = sqlx::query("SELECT t.id, t.name, t.color, pt.prompt_id FROM tags t JOIN prompt_tags pt ON t.id = pt.tag_id ORDER BY t.name")
        .fetch_all(&mut *tx).await?;
    let mut tags: HashMap<String, Vec<Tag>> = HashMap::new();
    for row in rows {
        tags.entry(row.try_get("prompt_id")?).or_default().push(Tag {
            id: row.try_get("id")?, name: row.try_get("name")?, color: row.try_get("color")?,
        });
    }
    let rows = sqlx::query("SELECT id, content, category_id, position, is_favorite, created_at, updated_at FROM prompts ORDER BY position, created_at DESC")
        .fetch_all(&mut *tx).await?;
    let prompts = rows.iter().map(|row| {
        let id: String = row.try_get("id")?;
        Ok(Prompt {
            tags: tags.remove(&id).unwrap_or_default(), id,
            content: row.try_get("content")?, category_id: row.try_get("category_id")?,
            position: row.try_get("position")?, is_favorite: row.try_get::<i64, _>("is_favorite")? == 1,
            date_created: row.try_get("created_at")?, date_modified: row.try_get("updated_at")?,
        })
    }).collect::<Result<Vec<_>, sqlx::Error>>()?;
    tx.commit().await?;
    Ok(Library { categories, prompts })
}

#[cfg(test)]
#[path = "read_tests.rs"]
mod tests;
