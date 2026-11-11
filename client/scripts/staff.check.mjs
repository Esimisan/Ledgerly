import {
  PERMISSION_GROUPS,
  LOCKED_ADMIN_PERMISSIONS,
} from "../src/config/permissions.js";

const keys = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key));
const problems = [];
if (keys.length !== 18)
  problems.push(`expected 18 permissions, got ${keys.length}`);
if (new Set(keys).size !== keys.length)
  problems.push("duplicate permission key");
for (const k of LOCKED_ADMIN_PERMISSIONS)
  if (!keys.includes(k)) problems.push(`locked key missing: ${k}`);
for (const g of PERMISSION_GROUPS)
  for (const i of g.items)
    if (!i.label || !i.description) problems.push(`missing text: ${i.key}`);

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("staff.check: OK (18 permissions)");
