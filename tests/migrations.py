"""真实 SQLite 回归：从旧 schema 升级、完整迁移、关系保留、事务回滚。"""
import pathlib
import re
import sqlite3
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


class Migrations(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript((ROOT / "src-tauri/db/schema.sql").read_text(encoding="utf-8"))
        self.db.execute(
            "INSERT INTO prompts(id,title,content,created_at,updated_at) VALUES(?,?,?,?,?)",
            ("legacy", "旧标题", "原始内容😀", "2026-01-01", "2026-01-01"),
        )
        self.db.execute("INSERT INTO tags VALUES('tag','代码','#14786a')")
        self.db.execute("INSERT INTO prompt_tags VALUES('legacy','tag')")
        self.db.commit()
        self.db.executescript((ROOT / "src-tauri/db/002_categories.sql").read_text(encoding="utf-8"))

    def tearDown(self):
        self.db.close()

    def test_legacy_content_and_relationship_preserved(self):
        self.assertEqual(self.db.execute("SELECT content,category_id FROM prompts").fetchall(), [("原始内容😀", "general")])
        self.assertEqual(self.db.execute("SELECT * FROM prompt_tags").fetchall(), [("legacy", "tag")])
        self.assertEqual(self.db.execute("PRAGMA foreign_key_check").fetchall(), [])
        self.assertNotIn("title", [row[1] for row in self.db.execute("PRAGMA table_info(prompts)")])

    def test_failure_rolls_back_all_related_changes(self):
        with self.assertRaises(sqlite3.IntegrityError):
            with self.db:
                self.db.execute("UPDATE prompts SET content='不应保存' WHERE id='legacy'")
                self.db.execute("INSERT INTO prompt_tags VALUES('missing','tag')")
        self.assertEqual(self.db.execute("SELECT content FROM prompts").fetchone()[0], "原始内容😀")

    def test_category_check_and_native_order_sql(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO categories VALUES('invalid','',1)")
        self.db.execute("INSERT INTO categories VALUES('design','设计',1)")
        # 模拟后端移动语句：同分类保留位置，跨分类使用新位置。
        self.db.execute(
            "UPDATE prompts SET content=?,category_id=?,position=CASE WHEN category_id=? THEN position ELSE ? END WHERE id=?",
            ("移动", "design", "design", 7, "legacy"),
        )
        self.assertEqual(self.db.execute("SELECT category_id,position FROM prompts").fetchone(), ("design", 7))

    def test_every_native_query_has_valid_sqlite_syntax(self):
        statements = []
        for filename in ("store.rs", "tray.rs", "read.rs"):
            source = (ROOT / "src-tauri/src" / filename).read_text(encoding="utf-8")
            statements.extend(re.findall(r'sqlx::query(?:_scalar)?\("([^"]+)"\)', source))
        self.assertGreater(len(statements), 20)
        for statement in statements:
            with self.subTest(sql=statement):
                self.db.execute("EXPLAIN " + statement, [None] * statement.count("?")).fetchall()


if __name__ == "__main__":
    unittest.main(verbosity=2)
