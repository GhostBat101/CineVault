pub mod schema;
pub mod repository;

pub use repository::*;

use rusqlite::{Connection, Result};
use std::path::Path;

pub struct DatabaseManager {
    conn: Connection,
}

impl DatabaseManager {
    pub fn init<P: AsRef<Path>>(db_path: P) -> Result<Self> {
        let conn = Connection::open(db_path)?;
        
        // Enforce WAL mode and Foreign Keys
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        
        let manager = Self { conn };
        manager.run_migrations()?;
        Ok(manager)
    }

    fn run_migrations(&self) -> Result<()> {
        self.conn.execute_batch(schema::INITIAL_SCHEMA)?;
        Ok(())
    }

    pub fn connection(&self) -> &Connection {
        &self.conn
    }
}
