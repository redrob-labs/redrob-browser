//! A map keyed by DOM node, stored as a dense array by node index.
//!
//! The layout keeps several values per node (box rects first) that every
//! layout reads, compares and copies for thousands of nodes. In a hash map
//! each of those is a hash and a probe; here it is an index. The methods
//! mirror the `HashMap` ones the engine uses; iteration is in node order.
//! Node indices from `DENSE_LIMIT` on (never a real document's) go to a
//! small hash map, so a stray id cannot grow the array.

use obscura_dom::tree::NodeId;

use crate::HashMap;

/// Node indices kept in the dense array.
const DENSE_LIMIT: usize = 1 << 24;

#[derive(Clone, Debug)]
pub struct NodeMap<V> {
    slots: Vec<Option<(NodeId, V)>>,
    overflow: HashMap<NodeId, V>,
    len: usize,
}

impl<V> Default for NodeMap<V> {
    fn default() -> Self {
        Self {
            slots: Vec::new(),
            overflow: HashMap::default(),
            len: 0,
        }
    }
}

impl<V: PartialEq> PartialEq for NodeMap<V> {
    fn eq(&self, other: &Self) -> bool {
        self.len == other.len
            && self
                .iter()
                .all(|(id, value)| other.get(id).is_some_and(|other| other == value))
    }
}

impl<V> NodeMap<V> {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            slots: Vec::with_capacity(capacity.min(DENSE_LIMIT)),
            overflow: HashMap::default(),
            len: 0,
        }
    }

    #[inline]
    pub fn get(&self, id: &NodeId) -> Option<&V> {
        match self.slots.get(id.index()) {
            Some(slot) => slot.as_ref().map(|(_, value)| value),
            None if id.index() < DENSE_LIMIT => None,
            None => self.overflow.get(id),
        }
    }

    #[inline]
    pub fn get_mut(&mut self, id: &NodeId) -> Option<&mut V> {
        match self.slots.get_mut(id.index()) {
            Some(slot) => slot.as_mut().map(|(_, value)| value),
            None if id.index() < DENSE_LIMIT => None,
            None => self.overflow.get_mut(id),
        }
    }

    pub fn get_key_value(&self, id: &NodeId) -> Option<(&NodeId, &V)> {
        match self.slots.get(id.index()) {
            Some(slot) => slot.as_ref().map(|(id, value)| (id, value)),
            None if id.index() < DENSE_LIMIT => None,
            None => self.overflow.get_key_value(id),
        }
    }

    #[inline]
    pub fn contains_key(&self, id: &NodeId) -> bool {
        self.get(id).is_some()
    }

    pub fn len(&self) -> usize {
        self.len
    }

    pub fn is_empty(&self) -> bool {
        self.len == 0
    }

    pub fn insert(&mut self, id: NodeId, value: V) -> Option<V> {
        let index = id.index();
        if index >= DENSE_LIMIT {
            let old = self.overflow.insert(id, value);
            if old.is_none() {
                self.len += 1;
            }
            return old;
        }
        if index >= self.slots.len() {
            self.slots.resize_with(index + 1, || None);
        }
        match &mut self.slots[index] {
            Some((_, old)) => Some(std::mem::replace(old, value)),
            slot @ None => {
                *slot = Some((id, value));
                self.len += 1;
                None
            }
        }
    }

    pub fn remove(&mut self, id: &NodeId) -> Option<V> {
        let removed = match self.slots.get_mut(id.index()) {
            Some(slot) => slot.take().map(|(_, value)| value),
            None if id.index() < DENSE_LIMIT => None,
            None => self.overflow.remove(id),
        };
        if removed.is_some() {
            self.len -= 1;
        }
        removed
    }

    pub fn iter(&self) -> Iter<'_, V> {
        Iter {
            slots: self.slots.iter(),
            overflow: self.overflow.iter(),
        }
    }

    pub fn iter_mut(&mut self) -> impl Iterator<Item = (&NodeId, &mut V)> {
        self.slots
            .iter_mut()
            .filter_map(|slot| slot.as_mut().map(|(id, value)| (&*id, value)))
            .chain(self.overflow.iter_mut())
    }

    pub fn keys(&self) -> impl Iterator<Item = &NodeId> + Clone {
        self.iter().map(|(id, _)| id)
    }

    pub fn values(&self) -> impl Iterator<Item = &V> + Clone {
        self.iter().map(|(_, value)| value)
    }

    pub fn values_mut(&mut self) -> impl Iterator<Item = &mut V> {
        self.iter_mut().map(|(_, value)| value)
    }

    pub fn retain(&mut self, mut keep: impl FnMut(&NodeId, &mut V) -> bool) {
        let mut removed = 0;
        for slot in &mut self.slots {
            if let Some((id, value)) = slot {
                if !keep(id, value) {
                    *slot = None;
                    removed += 1;
                }
            }
        }
        let before = self.overflow.len();
        self.overflow.retain(|id, value| keep(id, value));
        removed += before - self.overflow.len();
        self.len -= removed;
    }

    pub fn reserve(&mut self, additional: usize) {
        self.slots.reserve(additional.min(DENSE_LIMIT));
    }

    pub fn clear(&mut self) {
        self.slots.clear();
        self.overflow.clear();
        self.len = 0;
    }

    /// The value of `id`, inserted from `make` when it has none.
    pub fn get_or_insert_with(&mut self, id: NodeId, make: impl FnOnce() -> V) -> &mut V {
        if !self.contains_key(&id) {
            self.insert(id, make());
        }
        self.get_mut(&id).expect("inserted above")
    }

    /// The entries as a hash map (for a comparison that needs one).
    pub(crate) fn to_hash_map(&self) -> HashMap<NodeId, &V> {
        self.iter().map(|(id, value)| (*id, value)).collect()
    }

    /// `HashMap::entry(id).or_insert(value)`.
    pub fn entry_or_insert(&mut self, id: NodeId, value: V) -> &mut V {
        self.get_or_insert_with(id, || value)
    }

    pub fn drain(&mut self) -> impl Iterator<Item = (NodeId, V)> + '_ {
        self.len = 0;
        self.slots.drain(..).flatten().chain(self.overflow.drain())
    }
}

/// The entries of a `NodeMap`: dense ones in node order, then the others.
pub struct Iter<'a, V> {
    slots: std::slice::Iter<'a, Option<(NodeId, V)>>,
    overflow: std::collections::hash_map::Iter<'a, NodeId, V>,
}

impl<V> Clone for Iter<'_, V> {
    fn clone(&self) -> Self {
        Self {
            slots: self.slots.clone(),
            overflow: self.overflow.clone(),
        }
    }
}

impl<'a, V> Iterator for Iter<'a, V> {
    type Item = (&'a NodeId, &'a V);

    #[inline]
    fn next(&mut self) -> Option<Self::Item> {
        if let Some((id, value)) = self.slots.by_ref().flatten().next() {
            return Some((id, value));
        }
        self.overflow.next()
    }
}

impl<V> std::ops::Index<&NodeId> for NodeMap<V> {
    type Output = V;

    fn index(&self, id: &NodeId) -> &V {
        self.get(id).expect("no value for node")
    }
}

impl<'a, V> IntoIterator for &'a NodeMap<V> {
    type Item = (&'a NodeId, &'a V);
    type IntoIter = Iter<'a, V>;

    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}

impl<V> IntoIterator for NodeMap<V> {
    type Item = (NodeId, V);
    type IntoIter = std::iter::Chain<
        std::iter::Flatten<std::vec::IntoIter<Option<(NodeId, V)>>>,
        std::collections::hash_map::IntoIter<NodeId, V>,
    >;

    fn into_iter(self) -> Self::IntoIter {
        self.slots.into_iter().flatten().chain(self.overflow)
    }
}

impl<V> FromIterator<(NodeId, V)> for NodeMap<V> {
    fn from_iter<I: IntoIterator<Item = (NodeId, V)>>(iter: I) -> Self {
        let mut map = Self::default();
        map.extend(iter);
        map
    }
}

impl<V> Extend<(NodeId, V)> for NodeMap<V> {
    fn extend<I: IntoIterator<Item = (NodeId, V)>>(&mut self, iter: I) {
        for (id, value) in iter {
            self.insert(id, value);
        }
    }
}

impl<'a, V: Copy + 'a> Extend<(&'a NodeId, &'a V)> for NodeMap<V> {
    fn extend<I: IntoIterator<Item = (&'a NodeId, &'a V)>>(&mut self, iter: I) {
        for (id, value) in iter {
            self.insert(*id, *value);
        }
    }
}
