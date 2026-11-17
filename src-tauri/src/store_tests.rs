// 原生事务测试在 CI 的 cargo test --lib 执行，不启动图形界面。
use super::{apply, Action};
use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};

async fn database() -> SqlitePool {
    let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
    sqlx::raw_sql(include_str!("../db/schema.sql")).execute(&pool).await.unwrap();
    sqlx::raw_sql(include_str!("../db/002_categories.sql")).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO categories VALUES('design','Design',1)").execute(&pool).await.unwrap();
    pool
}
fn input(id: Option<String>, content: &str, categories: &[&str]) -> Action {
    Action::SavePrompt { id, content: content.into(), tags: vec!["代码".into()],
        category_ids: categories.iter().map(|value| value.to_string()).collect() }
}
#[test]
fn independent_copies_and_editing() {
    tauri::async_runtime::block_on(async {
        let pool = database().await;
        apply(&pool, input(None, "original", &["general", "design"])).await.unwrap();
        let ids: Vec<String> = sqlx::query_scalar("SELECT id FROM prompts ORDER BY category_id").fetch_all(&pool).await.unwrap();
        assert_eq!(ids.len(), 2);
        assert_ne!(ids[0], ids[1]);
        apply(&pool, input(Some(ids[0].clone()), "changed", &["design"])).await.unwrap();
        let unchanged: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM prompts WHERE content='original' AND category_id='general'").fetch_one(&pool).await.unwrap();
        assert_eq!(unchanged, 1);
        pool.close().await;
    });
}
#[test]
fn failed_multi_project_write_rolls_back() {
    tauri::async_runtime::block_on(async {
        let pool = database().await;
        assert!(apply(&pool, input(None, "never commit", &["design", "missing"])).await.is_err());
        let prompts: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM prompts").fetch_one(&pool).await.unwrap();
        let tags: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM tags").fetch_one(&pool).await.unwrap();
        assert_eq!((prompts, tags), (0, 0));
        pool.close().await;
    });
}
#[test]
fn reorder_rejects_missing_duplicate_and_foreign_ids() {
    tauri::async_runtime::block_on(async {
        let pool = database().await;
        apply(&pool, input(None, "first", &["general"])).await.unwrap();
        apply(&pool, input(None, "second", &["general"])).await.unwrap();
        let ids: Vec<String> = sqlx::query_scalar("SELECT id FROM prompts ORDER BY position").fetch_all(&pool).await.unwrap();
        for invalid in [vec![ids[0].clone()], vec![ids[0].clone(), ids[0].clone()], vec![ids[0].clone(), "foreign".into()]] {
            assert!(apply(&pool, Action::Reorder { category_id: "general".into(), ids: invalid }).await.is_err());
        }
        let reversed = vec![ids[1].clone(), ids[0].clone()];
        apply(&pool, Action::Reorder { category_id: "general".into(), ids: reversed.clone() }).await.unwrap();
        let actual: Vec<String> = sqlx::query_scalar("SELECT id FROM prompts ORDER BY position").fetch_all(&pool).await.unwrap();
        assert_eq!(actual, reversed);
        pool.close().await;
    });
}
#[test]
fn boundary_validation_and_category_protection() {
    tauri::async_runtime::block_on(async {
        let pool = database().await;
        assert!(apply(&pool, input(None, "  ", &["general"])).await.is_err());
        assert!(apply(&pool, input(None, "content", &[])).await.is_err());
        assert!(apply(&pool, Action::DeleteCategory { id: "general".into() }).await.is_err());
        apply(&pool, input(None, "keep", &["general", "design"])).await.unwrap();
        apply(&pool, Action::SavePrompt { id: None, content: "remove".into(),
            tags: vec!["仅此分类".into()], category_ids: vec!["design".into()] }).await.unwrap();
        apply(&pool, Action::DeleteCategory { id: "design".into() }).await.unwrap();
        let prompts: Vec<(String, String)> = sqlx::query_as("SELECT category_id,content FROM prompts").fetch_all(&pool).await.unwrap();
        assert_eq!(prompts, vec![("general".to_string(), "keep".to_string())]);
        let tags: Vec<String> = sqlx::query_scalar("SELECT name FROM tags").fetch_all(&pool).await.unwrap();
        assert_eq!(tags, vec!["代码".to_string()]);
        let links: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM prompt_tags").fetch_one(&pool).await.unwrap();
        assert_eq!(links, 1);
        let categories: Vec<String> = sqlx::query_scalar("SELECT id FROM categories").fetch_all(&pool).await.unwrap();
        assert_eq!(categories, vec!["general".to_string()]);
        assert!(apply(&pool, Action::DeleteCategory { id: "design".into() }).await.is_err());
        pool.close().await;
    });
}
#[test]
fn frontend_payload_uses_camel_case() {
    let action: Action = serde_json::from_value(serde_json::json!({
        "kind": "savePrompt", "id": null, "content": "x", "tags": [], "categoryIds": ["general"]
    })).unwrap();
    assert!(matches!(action, Action::SavePrompt { .. }));
    let reorder: Action = serde_json::from_value(serde_json::json!({
        "kind": "reorder", "categoryId": "general", "ids": []
    })).unwrap();
    assert!(matches!(reorder, Action::Reorder { .. }));
}
