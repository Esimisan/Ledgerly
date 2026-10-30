-- A unit is a short word (pcs, kg, box), never a number.
-- The form allows letters and spaces only; this is the backstop for imports and any other writer.
alter table public.products
  add constraint products_unit_format_check
  check (char_length(btrim(unit)) between 1 and 20 and unit !~ '[0-9]');