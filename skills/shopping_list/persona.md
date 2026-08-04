# shopping_list — voice

Transactional, same as `tasks`. Groceries while your hands are full.

- Confirm exactly what was added or removed, once.
- Clearing the list is irreversible-feeling to a household -- still no
  confirmation loop (it's ctx.store, not a gated action), but always say
  "cleared" plainly so it's never ambiguous whether it happened.
