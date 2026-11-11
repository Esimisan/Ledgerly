import PageHeader from "../../components/layout/PageHeader";
import Field from "../../components/ui/Field";
import ExportButton from "../../components/reports/ExportButton";
import {
  PagerBar,
  ReportCard,
  ReportState,
} from "../../components/reports/ReportParts";
import { useAuth } from "../../context/AuthContext";
import { useListParams } from "../../hooks/useListParams";
import { useRpcQuery } from "../../hooks/useRpcQuery";
import { AUDIT_AREAS, listAuditActors, listAuditLog } from "../../data/audit";
import { AUDIT_CSV_COLUMNS, changeDetails } from "../../lib/auditFormat";
import { formatDateTime } from "../../lib/format";
import "../../styles/audit.css";

export default function AuditLogPage() {
  const { business } = useAuth();
  const businessId = business.id;
  const { params, update } = useListParams();

  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const actor = params.get("actor") ?? "";
  const area = params.get("area") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const badRange = Boolean(from && to && from > to);
  const filtered = Boolean(from || to || actor || area);

  const actors = useRpcQuery(() => listAuditActors(businessId), [businessId]);
  const log = useRpcQuery(async () => {
    if (badRange) return { data: { rows: [], total: 0 }, error: "" };
    const res = await listAuditLog({
      businessId,
      from,
      to,
      actor,
      area,
      page,
    });
    return { data: res, error: res.error };
  }, [businessId, from, to, actor, area, page]);

  const rows = log.data?.rows ?? [];
  const total = log.data?.total ?? 0;

  const clearFilters = () => update({ from: "", to: "", actor: "", area: "" });

  return (
    <div className="stack">
      <PageHeader
        title="Audit log"
        subtitle="Who did what in this business. Entries cannot be edited or deleted."
      />

      <section className="card au-filters" aria-label="Filters">
        <div className="au-filters__grid">
          <Field
            label="From"
            type="date"
            value={from}
            onChange={(e) => update({ from: e.target.value })}
          />
          <Field
            label="To"
            type="date"
            value={to}
            error={
              badRange ? "Pick a date on or after the start date." : undefined
            }
            onChange={(e) => update({ to: e.target.value })}
          />
          <Field
            label="Person"
            as="select"
            value={actor}
            onChange={(e) => update({ actor: e.target.value })}
          >
            <option value="">Everyone</option>
            {(actors.data ?? []).map((a) => (
              <option key={a.user_id} value={a.user_id}>
                {a.full_name}
              </option>
            ))}
          </Field>
          <Field
            label="Area"
            as="select"
            value={area}
            onChange={(e) => update({ area: e.target.value })}
          >
            <option value="">All areas</option>
            {AUDIT_AREAS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Field>
        </div>
        <div className="au-filters__actions">
          {filtered && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={clearFilters}
            >
              Clear filters
            </button>
          )}
        </div>
      </section>

      <ReportCard
        title="Activity"
        subtitle={
          log.loading
            ? "Loading…"
            : `${total.toLocaleString("en")} ${total === 1 ? "entry" : "entries"}${filtered ? " match these filters" : ""}, newest first`
        }
        actions={
          <ExportButton
            filename="audit-log.csv"
            columns={AUDIT_CSV_COLUMNS}
            disabled={badRange || total === 0}
            fetchPage={(p, size) =>
              listAuditLog({
                businessId,
                from,
                to,
                actor,
                area,
                page: p,
                pageSize: size,
              })
            }
          />
        }
      >
        <ReportState
          loading={log.loading}
          error={log.loading ? "" : log.error}
          onRetry={log.reload}
          empty={!log.loading && rows.length === 0}
          emptyTitle={
            filtered ? "No entries match these filters" : "Nothing logged yet"
          }
          emptyText={
            filtered
              ? "Try a wider date range or clear the filters."
              : "Staff and role changes, invitations, settings, price changes, voids, returns and stock or balance adjustments will appear here."
          }
          emptyAction={
            filtered ? (
              <button
                type="button"
                className="btn btn--secondary"
                onClick={clearFilters}
              >
                Clear filters
              </button>
            ) : null
          }
        >
          <div className="table-wrap">
            <table className="table table--stack au-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Area</th>
                  <th>What happened</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const detail = changeDetails(r.changes);
                  return (
                    <tr key={r.id}>
                      <td data-label="When" className="au-when">
                        {formatDateTime(r.created_at)}
                      </td>
                      <td data-label="Who">{r.actor_name}</td>
                      <td data-label="Area">
                        <span className="badge">{r.area}</span>
                      </td>
                      <td data-label="What happened">
                        <div className="au-what">{r.summary}</div>
                        {detail && <div className="au-detail">{detail}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <PagerBar
            page={page}
            total={total}
            onPage={(p) => update({ page: String(p) })}
          />
        </ReportState>
      </ReportCard>
    </div>
  );
}
