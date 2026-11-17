use super::read_library;
use sqlx::sqlite::SqlitePoolOptions;

#[test]
fn fixed_read_preserves_empty_library_and_frontend_payload() {
    tauri::async_runtime::block_on(async {
        let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        sqlx::raw_sql(include_str!("../db/schema.sql")).execute(&pool).await.unwrap();
        sqlx::raw_sql(include_str!("../db/002_categories.sql")).execute(&pool).await.unwrap();
        let empty = read_library(&pool).await.unwrap();
        assert!(empty.prompts.is_empty());
        assert_eq!(empty.categories.len(), 1);
        sqlx::query("INSERT INTO prompts(id,content,category_id,position,is_favorite,created_at,updated_at) VALUES('prompt','内容😀','general',0,1,'created','updated')")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO tags VALUES('tag','代码','#14786a')").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO prompt_tags VALUES('prompt','tag')").execute(&pool).await.unwrap();
        let actual = serde_json::to_value(read_library(&pool).await.unwrap()).unwrap();
        assert_eq!(actual["prompts"], serde_json::json!([{
            "id": "prompt", "content": "内容😀", "categoryId": "general", "position": 0,
            "isFavorite": true, "dateCreated": "created", "dateModified": "updated",
            "tags": [{ "id": "tag", "name": "代码", "color": "#14786a" }]
        }]));
        let content: String = sqlx::query_scalar("SELECT content FROM prompts WHERE id='prompt'").fetch_one(&pool).await.unwrap();
        assert_eq!(content, "内容😀");
        pool.close().await;
    });
}
