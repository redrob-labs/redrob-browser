//! The computed styles of one layout, with a record of every style written.
//!
//! Reads go through `Deref` to the map. Every write goes through a method
//! here, which notes the node, so a layout knows which boxes may differ from
//! the ones a retained box tree was built from (see `retain`): the compiler,
//! not a convention, keeps a pass from changing a style unnoticed.

use obscura_dom::tree::NodeId;

use crate::HashMap;

#[derive(Default)]
pub(crate) struct StyleMap {
    map: HashMap<NodeId, crate::LayoutStyle>,
    /// Nodes whose style was written since the last `take_changes` (may
    /// repeat).
    changed: Vec<NodeId>,
    /// A write the map cannot attribute to nodes (`values_mut`) happened.
    all_changed: bool,
    /// Writes are not recorded (a map no box tree is built from).
    untracked: bool,
}

/// What `StyleMap::take_changes` reports.
pub(crate) enum StyleChanges {
    Nodes(Vec<NodeId>),
    All,
}

impl StyleMap {
    pub(crate) fn new(map: HashMap<NodeId, crate::LayoutStyle>) -> Self {
        Self {
            map,
            changed: Vec::new(),
            all_changed: false,
            untracked: false,
        }
    }

    /// A map whose writes are not recorded.
    pub(crate) fn untracked(map: HashMap<NodeId, crate::LayoutStyle>) -> Self {
        Self {
            untracked: true,
            ..Self::new(map)
        }
    }

    pub(crate) fn into_inner(self) -> HashMap<NodeId, crate::LayoutStyle> {
        self.map
    }

    /// The nodes written since the last call.
    pub(crate) fn take_changes(&mut self) -> StyleChanges {
        if std::mem::take(&mut self.all_changed) {
            self.changed.clear();
            return StyleChanges::All;
        }
        StyleChanges::Nodes(std::mem::take(&mut self.changed))
    }

    /// How many writes were noted since the last `take_changes`.
    pub(crate) fn changed_len(&self) -> usize {
        if self.all_changed {
            usize::MAX
        } else {
            self.changed.len()
        }
    }

    /// Note `id` as changed without writing (its style is replaced by other
    /// means, e.g. a cascade into a scratch map).
    pub(crate) fn note(&mut self, id: NodeId) {
        self.push(id);
    }

    #[inline]
    fn push(&mut self, id: NodeId) {
        if !self.untracked {
            self.changed.push(id);
        }
    }

    pub(crate) fn get_mut(&mut self, id: &NodeId) -> Option<&mut crate::LayoutStyle> {
        if !self.untracked && self.map.contains_key(id) {
            self.changed.push(*id);
        }
        self.map.get_mut(id)
    }

    /// A write that is not noted. Only for a pass that undoes its own write
    /// before the layout ends and whose writes the retained build compares
    /// itself (the deferred flex percentages).
    pub(crate) fn get_mut_untracked(&mut self, id: &NodeId) -> Option<&mut crate::LayoutStyle> {
        self.map.get_mut(id)
    }

    /// Write `f`'s result into the style of `id` only when it differs from
    /// `get`'s view of it: no change is noted for an equal value.
    pub(crate) fn update<T: PartialEq>(
        &mut self,
        id: &NodeId,
        get: impl FnOnce(&mut crate::LayoutStyle) -> &mut T,
        value: T,
    ) -> bool {
        let Some(style) = self.map.get_mut(id) else {
            return false;
        };
        let slot = get(style);
        if *slot == value {
            return false;
        }
        *slot = value;
        if !self.untracked {
            self.changed.push(*id);
        }
        true
    }

    pub(crate) fn insert(
        &mut self,
        id: NodeId,
        style: crate::LayoutStyle,
    ) -> Option<crate::LayoutStyle> {
        self.push(id);
        self.map.insert(id, style)
    }

    pub(crate) fn remove(&mut self, id: &NodeId) -> Option<crate::LayoutStyle> {
        let old = self.map.remove(id);
        if old.is_some() {
            self.push(*id);
        }
        old
    }

    pub(crate) fn entry(
        &mut self,
        id: NodeId,
    ) -> std::collections::hash_map::Entry<'_, NodeId, crate::LayoutStyle> {
        self.push(id);
        self.map.entry(id)
    }

    pub(crate) fn values_mut(
        &mut self,
    ) -> std::collections::hash_map::ValuesMut<'_, NodeId, crate::LayoutStyle> {
        self.all_changed |= !self.untracked;
        self.map.values_mut()
    }

    pub(crate) fn iter_mut(
        &mut self,
    ) -> std::collections::hash_map::IterMut<'_, NodeId, crate::LayoutStyle> {
        self.all_changed |= !self.untracked;
        self.map.iter_mut()
    }

    pub(crate) fn retain(&mut self, mut keep: impl FnMut(&NodeId, &crate::LayoutStyle) -> bool) {
        let changed = &mut self.changed;
        let untracked = self.untracked;
        self.map.retain(|id, style| {
            let kept = keep(id, &*style);
            if !kept && !untracked {
                changed.push(*id);
            }
            kept
        });
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
