-- 保留原迁移校验和，将历史提示词完整迁入默认项目，并彻底移除标题列。
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 80),
  position INTEGER NOT NULL DEFAULT 0
);
INSERT INTO categories (id, name, position) VALUES ('general', 'General', 0);
ALTER TABLE prompts ADD COLUMN category_id TEXT NOT NULL DEFAULT 'general';
ALTER TABLE prompts ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
ALTER TABLE prompts DROP COLUMN title;
CREATE INDEX prompts_category_order ON prompts(category_id, position, created_at);
CREATE INDEX prompt_tags_tag ON prompt_tags(tag_id);
