//! Computed styles by node.
//!
//! A style is a few kilobytes. Kept inline in a hash map, every lookup
//! compares keys that sit kilobytes apart (a cache miss per probe), and every
//! insert and growth moves whole styles. The table is a dense array of boxed
//! styles indexed by node index: a lookup is an index and a pointer, with no
//! hashing, and moving a style moves a pointer. The methods mirror the
//! `HashMap` ones the engine uses. Node indices from `DENSE_LIMIT` on (never
//! a real document's) go to a small map, so a stray id cannot grow the array.

use obscura_dom::tree::NodeId;

use crate::{HashMap, LayoutStyle};

/// Node indices kept in the dense array.
const DENSE_LIMIT: usize = 1 << 24;

type Slot = Option<(NodeId, Box<LayoutStyle>)>;

#[derive(Clone, Debug, Default)]
pub struct StyleTable {
    slots: Vec<Slot>,
    overflow: HashMap<NodeId, Box<LayoutStyle>>,
    len: usize,
}

impl PartialEq for StyleTable {
    fn eq(&self, other: &Self) -> bool {
        self.len == other.len
            && self
                .iter()
                .all(|(id, style)| other.get(id).is_some_and(|other| other == style))
    }
}

impl StyleTable {
    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            slots: Vec::with_capacity(capacity.min(DENSE_LIMIT)),
            overflow: HashMap::default(),
            len: 0,
        }
    }

    #[inline]
    pub fn get(&self, id: &NodeId) -> Option<&LayoutStyle> {
        match self.slots.get(id.index()) {
            Some(slot) => slot.as_ref().map(|(_, style)| &**style),
            None if id.index() < DENSE_LIMIT => None,
            None => self.overflow.get(id).map(|style| &**style),
        }
    }

    #[inline]
    pub fn get_mut(&mut self, id: &NodeId) -> Option<&mut LayoutStyle> {
        match self.slots.get_mut(id.index()) {
            Some(slot) => slot.as_mut().map(|(_, style)| &mut **style),
            None if id.index() < DENSE_LIMIT => None,
            None => self.overflow.get_mut(id).map(|style| &mut **style),
        }
    }

    pub fn get_key_value(&self, id: &NodeId) -> Option<(&NodeId, &LayoutStyle)> {
        match self.slots.get(id.index()) {
            Some(slot) => slot.as_ref().map(|(id, style)| (id, &**style)),
            None if id.index() < DENSE_LIMIT => None,
            None => self
                .overflow
                .get_key_value(id)
                .map(|(id, style)| (id, &**style)),
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

    pub fn insert(&mut self, id: NodeId, style: LayoutStyle) -> Option<LayoutStyle> {
        let index = id.index();
        if index >= DENSE_LIMIT {
            return match self.overflow.get_mut(&id) {
                Some(old) => Some(std::mem::replace(&mut **old, style)),
                None => {
                    self.overflow.insert(id, Box::new(style));
                    self.len += 1;
                    None
                }
            };
        }
        if index >= self.slots.len() {
            self.slots.resize_with(index + 1, || None);
        }
        match &mut self.slots[index] {
            Some((_, old)) => Some(std::mem::replace(&mut **old, style)),
            slot @ None => {
                *slot = Some((id, Box::new(style)));
                self.len += 1;
                None
            }
        }
    }

    pub fn remove(&mut self, id: &NodeId) -> Option<LayoutStyle> {
        let removed = match self.slots.get_mut(id.index()) {
            Some(slot) => slot.take().map(|(_, style)| style),
            None if id.index() < DENSE_LIMIT => None,
            None => self.overflow.remove(id),
        };
        if removed.is_some() {
            self.len -= 1;
        }
        removed.map(|style| *style)
    }

    pub fn iter(&self) -> Iter<'_> {
        Iter {
            slots: self.slots.iter(),
            overflow: self.overflow.iter(),
        }
    }

    pub fn iter_mut(&mut self) -> impl Iterator<Item = (&NodeId, &mut LayoutStyle)> {
        self.slots
            .iter_mut()
            .filter_map(|slot| slot.as_mut().map(|(id, style)| (&*id, &mut **style)))
            .chain(
                self.overflow
                    .iter_mut()
                    .map(|(id, style)| (id, &mut **style)),
            )
    }

    pub fn keys(&self) -> impl Iterator<Item = &NodeId> + Clone {
        self.iter().map(|(id, _)| id)
    }

    pub fn values(&self) -> impl Iterator<Item = &LayoutStyle> + Clone {
        self.iter().map(|(_, style)| style)
    }

    pub fn values_mut(&mut self) -> impl Iterator<Item = &mut LayoutStyle> {
        self.iter_mut().map(|(_, style)| style)
    }

    pub fn retain(&mut self, mut keep: impl FnMut(&NodeId, &mut LayoutStyle) -> bool) {
        let mut removed = 0;
        for slot in &mut self.slots {
            if let Some((id, style)) = slot {
                if !keep(id, style) {
                    *slot = None;
                    removed += 1;
                }
            }
        }
        let before = self.overflow.len();
        self.overflow.retain(|id, style| keep(id, style));
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

    /// The styles as a map (for a comparison that only needs map access).
    pub(crate) fn boxed(&self) -> HashMap<NodeId, &LayoutStyle> {
        self.iter().map(|(id, style)| (*id, style)).collect()
    }

    /// The style of `id`, inserted from `make` when it has none.
    pub fn get_or_insert_with(
        &mut self,
        id: NodeId,
        make: impl FnOnce() -> LayoutStyle,
    ) -> &mut LayoutStyle {
        if !self.contains_key(&id) {
            self.insert(id, make());
        }
        self.get_mut(&id).expect("inserted above")
    }
}

/// The entries of a `StyleTable`: dense ones in node order, then the others.
#[derive(Clone)]
pub struct Iter<'a> {
    slots: std::slice::Iter<'a, Slot>,
    overflow: std::collections::hash_map::Iter<'a, NodeId, Box<LayoutStyle>>,
}

impl<'a> Iterator for Iter<'a> {
    type Item = (&'a NodeId, &'a LayoutStyle);

    #[inline]
    fn next(&mut self) -> Option<Self::Item> {
        if let Some((id, style)) = self.slots.by_ref().flatten().next() {
            return Some((id, &**style));
        }
        self.overflow.next().map(|(id, style)| (id, &**style))
    }
}

impl std::ops::Index<&NodeId> for StyleTable {
    type Output = LayoutStyle;

    fn index(&self, id: &NodeId) -> &LayoutStyle {
        self.get(id).expect("no style for node")
    }
}

impl<'a> IntoIterator for &'a StyleTable {
    type Item = (&'a NodeId, &'a LayoutStyle);
    type IntoIter = Iter<'a>;

    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}

impl FromIterator<(NodeId, LayoutStyle)> for StyleTable {
    fn from_iter<I: IntoIterator<Item = (NodeId, LayoutStyle)>>(iter: I) -> Self {
        let mut table = Self::default();
        table.extend(iter);
        table
    }
}

impl Extend<(NodeId, LayoutStyle)> for StyleTable {
    fn extend<I: IntoIterator<Item = (NodeId, LayoutStyle)>>(&mut self, iter: I) {
        for (id, style) in iter {
            self.insert(id, style);
        }
    }
}
