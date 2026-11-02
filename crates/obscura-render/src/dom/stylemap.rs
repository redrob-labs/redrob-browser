//! The computed styles of one layout, with a record of every style written.
//!
//! Reads go through `Deref` to the map. Every write goes through a method
//! here, which notes the node (and, when asked, keeps a copy of its style
//! from before the write), so a layout knows which boxes may differ from the
//! ones a retained box tree was built from (see `retain`): the compiler, not
//! a convention, keeps a pass from changing a style unnoticed.

use obscura_dom::tree::NodeId;

use crate::HashMap;

/// Most styles a map copies before their first write (see `keep_before`);
/// past it the copies are dropped and every noted node counts as changed.
const BEFORE_LIMIT: usize = 4096;

/// What each written node's style was before its first write since the
/// last `take_before` (`None`: it had none).
/// Boxed: a written style is copied once, and the map's growth moves
/// pointers, not styles.
pub(crate) type BeforeWrites = HashMap<NodeId, Option<Box<crate::LayoutStyle>>>;

#[derive(Default)]
pub(crate) struct StyleMap {
    map: HashMap<NodeId, crate::LayoutStyle>,
    /// Nodes whose style was written since the last `take_changes` (may
    /// repeat).
    changed: Vec<NodeId>,
    /// A write the map cannot attribute to nodes (`values_mut`) happened.
    all_changed: bool,
    /// Every node written since the map was made (may repeat); unlike
    /// `changed`, never taken.
    written: Vec<NodeId>,
    /// A write the map cannot attribute to nodes happened since it was made.
    written_all: bool,
    /// Writes are not recorded (a map no box tree is built from).
    untracked: bool,
    /// Copies of styles from before their first write, when kept.
    before: Option<BeforeWrites>,
    /// More than `BEFORE_LIMIT` styles were written: `before` is incomplete.
    before_overflow: bool,
    /// `OBSCURA_STYLE_WRITE_CHECK`: the pass that first wrote each node.
    passes: Option<HashMap<NodeId, &'static str>>,
    /// The pass writing now (for `passes`).
    pass: &'static str,
}

fn write_check_enabled() -> bool {
    static ON: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
    *ON.get_or_init(|| std::env::var_os("OBSCURA_STYLE_WRITE_CHECK").is_some())
}

/// What `StyleMap::take_changes` reports.
pub(crate) enum StyleChanges {
    Nodes(Vec<NodeId>),
    All,
}

impl StyleMap {
    pub(crate) fn new(map: HashMap<NodeId, crate::LayoutStyle>) -> Self {
        let check = write_check_enabled();
        Self {
            map,
            before: check.then(HashMap::default),
            passes: check.then(HashMap::default),
            ..Self::default()
        }
    }

    /// A map whose writes are not recorded.
    pub(crate) fn untracked(map: HashMap<NodeId, crate::LayoutStyle>) -> Self {
        Self {
            map,
            untracked: true,
            ..Self::default()
        }
    }

    pub(crate) fn into_inner(self) -> HashMap<NodeId, crate::LayoutStyle> {
        self.map
    }

    /// From now on keep a copy of each style before its first write.
    pub(crate) fn keep_before(&mut self) {
        if self.before.is_none() {
            self.before = Some(HashMap::default());
        }
    }

    /// The styles written since the last call as they were before (`None`
    /// when copies are not kept or too many styles were written).
    pub(crate) fn take_before(&mut self) -> Option<BeforeWrites> {
        let before = self.before.as_mut().map(std::mem::take);
        if std::mem::take(&mut self.before_overflow) {
            return None;
        }
        before
    }

    /// The nodes written since the last call.
    pub(crate) fn take_changes(&mut self) -> StyleChanges {
        if std::mem::take(&mut self.all_changed) {
            self.changed.clear();
            return StyleChanges::All;
        }
        StyleChanges::Nodes(std::mem::take(&mut self.changed))
    }

    /// Whether `id`'s style is as it was before its first write since the
    /// last `take_before` (false when that is not known).
    pub(crate) fn is_as_before(&self, id: &NodeId) -> bool {
        !self.before_overflow
            && self
                .before
                .as_ref()
                .and_then(|before| before.get(id))
                .is_some_and(|old| old.as_deref() == self.map.get(id))
    }

    /// The nodes written since the last `take_changes` (may repeat; empty
    /// after a write the map could not attribute).
    pub(crate) fn changed_nodes(&self) -> Option<&[NodeId]> {
        (!self.all_changed).then_some(&self.changed)
    }

    /// Every node written since the map was made (may repeat); `None` when
    /// writes are not recorded or one could not be attributed.
    pub(crate) fn written_since_new(&self) -> Option<&[NodeId]> {
        (!self.untracked && !self.written_all).then_some(&self.written)
    }

    /// How many writes were noted since the last `take_changes`.
    pub(crate) fn changed_len(&self) -> usize {
        if self.all_changed {
            usize::MAX
        } else {
            self.changed.len()
        }
    }

    /// Name the pass whose writes follow (for `OBSCURA_STYLE_WRITE_CHECK`).
    pub(crate) fn set_pass(&mut self, pass: &'static str) {
        self.pass = pass;
    }

    /// With `OBSCURA_STYLE_WRITE_CHECK`, print per pass how many written
    /// styles are as they were before the write, and how many changed.
    pub(crate) fn report_writes(&mut self, label: &str) {
        let (Some(passes), Some(before)) = (self.passes.as_mut(), self.before.as_ref()) else {
            return;
        };
        let mut by_pass: std::collections::BTreeMap<&str, (usize, usize)> = Default::default();
        for (id, pass) in passes.drain() {
            let entry = by_pass.entry(pass).or_default();
            if before
                .get(&id)
                .is_some_and(|old| old.as_deref() == self.map.get(&id))
            {
                entry.0 += 1;
            } else {
                entry.1 += 1;
            }
        }
        eprintln!("[timing] style-write-check {label} (unchanged, changed) by pass: {by_pass:?}");
    }

    /// Note a write of `id`, before it happens.
    #[inline]
    fn note_write(&mut self, id: NodeId) {
        if self.untracked {
            return;
        }
        self.changed.push(id);
        self.written.push(id);
        if let Some(before) = self.before.as_mut() {
            if !before.contains_key(&id) {
                if before.len() >= BEFORE_LIMIT {
                    self.before_overflow = true;
                } else {
                    before.insert(id, self.map.get(&id).cloned().map(Box::new));
                }
            }
        }
        if let Some(passes) = self.passes.as_mut() {
            passes.entry(id).or_insert(self.pass);
        }
    }

    /// Note `id` as changed without writing (its style is replaced by other
    /// means).
    pub(crate) fn note(&mut self, id: NodeId) {
        self.note_write(id);
    }

    pub(crate) fn get_mut(&mut self, id: &NodeId) -> Option<&mut crate::LayoutStyle> {
        if self.map.contains_key(id) {
            self.note_write(*id);
        }
        self.map.get_mut(id)
    }

    /// A write that is not noted. Only for a pass that undoes its own write
    /// before the layout ends and whose writes the retained build compares
    /// itself (the deferred flex percentages).
    pub(crate) fn get_mut_untracked(&mut self, id: &NodeId) -> Option<&mut crate::LayoutStyle> {
        self.map.get_mut(id)
    }

    /// Write `value` into the field `get` selects of the style of `id` only
    /// when it differs: no change is noted for an equal value.
    pub(crate) fn update<T: PartialEq>(
        &mut self,
        id: &NodeId,
        get: impl Fn(&mut crate::LayoutStyle) -> &mut T,
        value: T,
    ) -> bool {
        let Some(style) = self.map.get_mut(id) else {
            return false;
        };
        if *get(style) == value {
            return false;
        }
        self.note_write(*id);
        if let Some(style) = self.map.get_mut(id) {
            *get(style) = value;
        }
        true
    }

    pub(crate) fn insert(
        &mut self,
        id: NodeId,
        style: crate::LayoutStyle,
    ) -> Option<crate::LayoutStyle> {
        self.note_write(id);
        self.map.insert(id, style)
    }

    /// `insert` for a caller that drops the old style: it moves into the
    /// copies from before the first write instead of being copied there.
    pub(crate) fn replace(&mut self, id: NodeId, style: crate::LayoutStyle) {
        if self.untracked {
            self.map.insert(id, style);
            return;
        }
        let keep_old = self
            .before
            .as_ref()
            .is_some_and(|before| !before.contains_key(&id));
        self.changed.push(id);
        self.written.push(id);
        if let Some(passes) = self.passes.as_mut() {
            passes.entry(id).or_insert(self.pass);
        }
        let old = self.map.insert(id, style);
        if keep_old {
            if let Some(before) = self.before.as_mut() {
                if before.len() >= BEFORE_LIMIT {
                    self.before_overflow = true;
                } else {
                    before.insert(id, old.map(Box::new));
                }
            }
        }
    }

    pub(crate) fn remove(&mut self, id: &NodeId) -> Option<crate::LayoutStyle> {
        if self.map.contains_key(id) {
            self.note_write(*id);
        }
        self.map.remove(id)
    }

    pub(crate) fn entry(
        &mut self,
        id: NodeId,
    ) -> std::collections::hash_map::Entry<'_, NodeId, crate::LayoutStyle> {
        self.note_write(id);
        self.map.entry(id)
    }

    pub(crate) fn values_mut(
        &mut self,
    ) -> std::collections::hash_map::ValuesMut<'_, NodeId, crate::LayoutStyle> {
        self.all_changed |= !self.untracked;
        self.written_all = true;
        self.map.values_mut()
    }

    pub(crate) fn iter_mut(
        &mut self,
    ) -> std::collections::hash_map::IterMut<'_, NodeId, crate::LayoutStyle> {
        self.all_changed |= !self.untracked;
        self.written_all = true;
        self.map.iter_mut()
    }

    pub(crate) fn retain(&mut self, mut keep: impl FnMut(&NodeId, &crate::LayoutStyle) -> bool) {
        let gone: Vec<NodeId> = self
            .map
            .iter()
            .filter(|(id, style)| !keep(id, style))
            .map(|(id, _)| *id)
            .collect();
        for id in gone {
            self.remove(&id);
        }
    }

    pub(crate) fn reserve(&mut self, additional: usize) {
        self.map.reserve(additional);
    }
}

impl std::ops::Deref for StyleMap {
    type Target = HashMap<NodeId, crate::LayoutStyle>;

    fn deref(&self) -> &Self::Target {
        &self.map
    }
}
