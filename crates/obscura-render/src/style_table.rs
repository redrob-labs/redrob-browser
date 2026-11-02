//! Computed styles by node.
//!
//! A style is a few kilobytes. Kept inline in a hash map, every lookup
//! compares keys that sit kilobytes apart (a cache miss per probe), and every
//! insert and growth moves whole styles. Boxed, the table is a dense array of
//! keys and pointers that the walks over it keep in cache, and moving a style
//! moves a pointer. The methods mirror the `HashMap` ones the engine uses.

use obscura_dom::tree::NodeId;

use crate::{HashMap, LayoutStyle};

#[derive(Clone, Debug, Default, PartialEq)]
pub struct StyleTable {
    map: HashMap<NodeId, Box<LayoutStyle>>,
}

impl StyleTable {
    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            map: HashMap::with_capacity_and_hasher(capacity, Default::default()),
        }
    }

    #[inline]
    pub fn get(&self, id: &NodeId) -> Option<&LayoutStyle> {
        self.map.get(id).map(|style| &**style)
    }

    #[inline]
    pub fn get_mut(&mut self, id: &NodeId) -> Option<&mut LayoutStyle> {
        self.map.get_mut(id).map(|style| &mut **style)
    }

    pub fn get_key_value(&self, id: &NodeId) -> Option<(&NodeId, &LayoutStyle)> {
        self.map.get_key_value(id).map(|(id, style)| (id, &**style))
    }

    #[inline]
    pub fn contains_key(&self, id: &NodeId) -> bool {
        self.map.contains_key(id)
    }

    pub fn len(&self) -> usize {
        self.map.len()
    }

    pub fn is_empty(&self) -> bool {
        self.map.is_empty()
    }

    pub fn insert(&mut self, id: NodeId, style: LayoutStyle) -> Option<LayoutStyle> {
        match self.map.get_mut(&id) {
            Some(old) => Some(std::mem::replace(&mut **old, style)),
            None => {
                self.map.insert(id, Box::new(style));
                None
            }
        }
    }

    pub fn remove(&mut self, id: &NodeId) -> Option<LayoutStyle> {
        self.map.remove(id).map(|style| *style)
    }

    pub fn iter(&self) -> impl Iterator<Item = (&NodeId, &LayoutStyle)> + Clone {
        self.map.iter().map(|(id, style)| (id, &**style))
    }

    pub fn iter_mut(&mut self) -> impl Iterator<Item = (&NodeId, &mut LayoutStyle)> {
        self.map.iter_mut().map(|(id, style)| (id, &mut **style))
    }

    pub fn keys(&self) -> impl Iterator<Item = &NodeId> + Clone {
        self.map.keys()
    }

    pub fn values(&self) -> impl Iterator<Item = &LayoutStyle> + Clone {
        self.map.values().map(|style| &**style)
    }

    pub fn values_mut(&mut self) -> impl Iterator<Item = &mut LayoutStyle> {
        self.map.values_mut().map(|style| &mut **style)
    }

    pub fn retain(&mut self, mut keep: impl FnMut(&NodeId, &mut LayoutStyle) -> bool) {
        self.map.retain(|id, style| keep(id, style));
    }

    pub fn reserve(&mut self, additional: usize) {
        self.map.reserve(additional);
    }

    pub fn clear(&mut self) {
        self.map.clear();
    }

    /// The boxed styles (for a comparison that only needs map access).
    pub(crate) fn boxed(&self) -> &HashMap<NodeId, Box<LayoutStyle>> {
        &self.map
    }

    /// The style of `id`, inserted from `make` when it has none.
    pub fn get_or_insert_with(
        &mut self,
        id: NodeId,
        make: impl FnOnce() -> LayoutStyle,
    ) -> &mut LayoutStyle {
        self.map.entry(id).or_insert_with(|| Box::new(make()))
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
    type IntoIter = std::iter::Map<
        std::collections::hash_map::Iter<'a, NodeId, Box<LayoutStyle>>,
        fn((&'a NodeId, &'a Box<LayoutStyle>)) -> (&'a NodeId, &'a LayoutStyle),
    >;

    fn into_iter(self) -> Self::IntoIter {
        self.map.iter().map(|(id, style)| (id, &**style))
    }
}

impl FromIterator<(NodeId, LayoutStyle)> for StyleTable {
    fn from_iter<I: IntoIterator<Item = (NodeId, LayoutStyle)>>(iter: I) -> Self {
        Self {
            map: iter
                .into_iter()
                .map(|(id, style)| (id, Box::new(style)))
                .collect(),
        }
    }
}

impl Extend<(NodeId, LayoutStyle)> for StyleTable {
    fn extend<I: IntoIterator<Item = (NodeId, LayoutStyle)>>(&mut self, iter: I) {
        for (id, style) in iter {
            self.insert(id, style);
        }
    }
}
