use std::{future::Future, pin::Pin};
use sqlx::{
    error::BoxDynError,
    migrate::{AppliedMigration, Migrate, MigrateError, Migration, MigrationSource, MigrationType, Migrator},
    SqlitePool,
};
use tauri::AppHandle;

#[derive(Debug)]
struct MigrationList(Vec<Migration>);

impl MigrationSource<'static> for MigrationList {
    fn resolve(self) -> Pin<Box<dyn Future<Output = Result<Vec<Migration>, BoxDynError>> + Send>> {
        Box::pin(async move { Ok(self.0) })
    }
}

pub async fn initialize(app: &AppHandle) -> Result<(), String> {
    let pool = crate::store::pool(app).await?;
    migrate(&pool).await.map_err(|error| format!("数据库迁移失败：{error}"))
}

async fn migrate(pool: &SqlitePool) -> Result<(), MigrateError> {
    // 沿用 SQL 插件已预加载的连接池，不另外打开数据库或改写历史校验记录。
    let mut connection = pool.acquire().await?;
    connection.ensure_migrations_table().await?;
    let applied = connection.list_applied_migrations().await?;
    let migrations = vec![
        historical_migration(1, "create initial tables", include_str!("../db/schema.sql"), &applied)?,
        historical_migration(2, "isolated projects and prompt order", include_str!("../db/002_categories.sql"), &applied)?,
    ];
    let migrator = Migrator::new(MigrationList(migrations)).await?;
    // 脏版本、未知版本与校验和仍由 SQLx 严格检查，每次迁移保留原有事务语义。
    migrator.run_direct(&mut *connection).await
}

fn historical_migration(
    version: i64,
    description: &'static str,
    source: &'static str,
    applied: &[AppliedMigration],
) -> Result<Migration, MigrateError> {
    // 新库统一使用 LF；只兼容同一份已发布 SQL 的 LF/CRLF 两种已知历史字节。
    let sql = source.replace("\r\n", "\n");
    let make = |text: String| Migration::new(
        version, description.into(), MigrationType::ReversibleUp, text.into(), false,
    );
    let canonical = make(sql.clone());
    if let Some(previous) = applied.iter().find(|migration| migration.version == version) {
        if previous.checksum != canonical.checksum {
            let windows = make(sql.replace('\n', "\r\n"));
            if previous.checksum != windows.checksum {
                // 任何其他变化都必须报错，不能把内容损坏当作换行差异忽略。
                return Err(MigrateError::VersionMismatch(version));
            }
            return Ok(windows);
        }
    }
    Ok(canonical)
}
