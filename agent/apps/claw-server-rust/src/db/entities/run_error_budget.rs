/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

use sea_orm::entity::prelude::*;

/// One row per UTC day, holding how many run failures were reported and how many the cap
/// turned away. Older days are pruned on rollover, so this table holds a single row.
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "run_error_budget")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub day: String,
    pub sent: i64,
    pub suppressed: i64,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
