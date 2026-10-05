# Copyright 2025 BrowserOS contributors
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
# See the NOTICE file at the repository root for provenance.
"""Product registry — one package per product.

Adding a product: create products/<id>/product.py with a
ProductDescriptor.define() call (plus its ServerBundle definitions),
import it below, and run `browseros product doctor` until green.
"""

from typing import Dict

from ..core.products import ProductDescriptor
from .browseros.product import BROWSEROS_PRODUCT, BROWSEROS_SERVER_BUNDLE
from .browserclaw.product import BROWSERCLAW_PRODUCT, BROWSERCLAW_SERVER_BUNDLE

DEFAULT_PRODUCT_ID = BROWSEROS_PRODUCT.id

PRODUCTS: Dict[str, ProductDescriptor] = {}
for _product in (BROWSEROS_PRODUCT, BROWSERCLAW_PRODUCT):
    if _product.id in PRODUCTS:
        raise ValueError(f"Duplicate product id: {_product.id}")
    PRODUCTS[_product.id] = _product

SERVER_BUNDLES = (BROWSEROS_SERVER_BUNDLE, BROWSERCLAW_SERVER_BUNDLE)

__all__ = [
    "DEFAULT_PRODUCT_ID",
    "PRODUCTS",
    "SERVER_BUNDLES",
    "BROWSEROS_PRODUCT",
    "BROWSERCLAW_PRODUCT",
    "BROWSERCLAW_SERVER_BUNDLE",
]
