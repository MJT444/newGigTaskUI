import { useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api, qs } from "../api/client.js";
import { DataTable, Pagination } from "../components/DataTable.jsx";
import { ClientSearch } from "../components/pickers.jsx";
import { QueryState } from "../components/StateViews.jsx";
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Money,
  PageHeader,
  StatCard,
} from "../components/ui.jsx";
import { useActor } from "../context/ActorContext.jsx";
import { formatDateTime, toInputDate } from "../lib/format.js";

export function EscrowPage() {
  const { actor, setActor } = useActor();
  const [draft, setDraft] = useState({ from: "", to: "" });
  const [filter, setFilter] = useState({ from: "", to: "" });
  const [page, setPage] = useState(1);

  const q = useQuery({
    queryKey: ["escrow", actor?.id, filter, page],
    queryFn: () =>
      api.get(
        `/api/clients/${actor.id}/audit${qs({
          ...filter,
          page,
          pageSize: 25,
        })}`,
      ),
    enabled: Boolean(actor),
    placeholderData: keepPreviousData,
  });

  if (!actor) {
    return (
      <>
        <PageHeader
          title="Escrow transaction history"
          description="Track your escrow balance, deposits, and deductions."
        />
        <Card title="Choose a client">
          <ClientSearch value={null} onSelect={setActor} />
        </Card>
      </>
    );
  }

  const rangeInvalid = draft.from && draft.to && draft.from > draft.to;

  const applyFilter = (f) => {
    setDraft(f);
    setFilter(f);
    setPage(1);
  };

  const preset = (days) =>
    applyFilter({
      from: toInputDate(new Date(Date.now() - (days - 1) * 86_400_000)),
      to: toInputDate(new Date()),
    });

  return (
    <>
      <PageHeader
        title="Escrow transaction history"
        description="Track your escrow balance, deposits, and deductions in one place."
      />

      <Card>
        <form
          className="filter-bar"
          onSubmit={(e) => {
            e.preventDefault();
            if (!rangeInvalid) applyFilter(draft);
          }}
        >
          <Field label="From" htmlFor="escrow-from">
            <input
              id="escrow-from"
              type="date"
              className="input"
              value={draft.from}
              onChange={(e) => setDraft({ ...draft, from: e.target.value })}
            />
          </Field>

          <Field label="To" htmlFor="escrow-to">
            <input
              id="escrow-to"
              type="date"
              className="input"
              value={draft.to}
              onChange={(e) => setDraft({ ...draft, to: e.target.value })}
            />
          </Field>

          <Button type="submit" disabled={Boolean(rangeInvalid)}>
            Apply
          </Button>

          <Button
            variant="ghost"
            onClick={() => applyFilter({ from: "", to: "" })}
          >
            All time
          </Button>

          <div className="chip-row">
            <button type="button" className="chip" onClick={() => preset(1)}>
              Today
            </button>

            <button type="button" className="chip" onClick={() => preset(30)}>
              Last 30 days
            </button>

            <button type="button" className="chip" onClick={() => preset(90)}>
              Last 90 days
            </button>
          </div>
        </form>

        {rangeInvalid && (
          <Alert tone="warning">
            The start date must be on or before the end date.
          </Alert>
        )}
      </Card>

      <QueryState query={q} loadingLabel="Loading transactions…">
        {(d) => (
          <>
            <div className="stats-grid">
              <StatCard
                label="Available escrow balance"
                value={<Money value={d.client.escrow_balance} />}
              />

              <StatCard
                label="Total deductions"
                value={<Money value={d.summary.totalDebits} action="DEBIT" />}
              />

              <StatCard
                label="Total deposits"
                value={<Money value={d.summary.totalCredits} action="CREDIT" />}
              />

              <StatCard
                label="Verified transactions"
                tone={
                  d.total > 0 && d.summary.matchingRows === d.total
                    ? "success"
                    : undefined
                }
                value={
                  d.total === 0
                    ? "—"
                    : `${d.summary.matchingRows.toLocaleString(
                        "en-IN",
                      )} / ${d.total.toLocaleString("en-IN")}`
                }
                hint="Transactions with verified balances"
              />
            </div>

            {d.total > 0 && d.summary.matchingRows < d.total && (
              <Alert tone="info" title="Understanding your transaction history">
                Older transactions may show historical balances that differ from
                calculated balances. New transactions are recorded automatically
                and their balances are verified.
              </Alert>
            )}

            <Card
              title={`${d.total.toLocaleString("en-IN")} transactions`}
              subtitle={
                filter.from || filter.to
                  ? `From ${filter.from || "the beginning"} to ${
                      filter.to || "today"
                    } · Newest first`
                  : "All transactions · Newest first"
              }
              actions={<TopUp clientId={actor.id} />}
            >
              {d.items.length === 0 ? (
                <p className="state state-empty">
                  {d.total === 0
                    ? "No transactions found for this period."
                    : "There are no transactions on this page."}
                </p>
              ) : (
                <>
                  <DataTable
                    caption="Escrow transaction history"
                    dimmed={q.isPlaceholderData}
                    rows={d.items}
                    columns={[
                      {
                        key: "seq",
                        header: "#",
                        align: "right",
                      },
                      {
                        key: "created_at",
                        header: "Date and time",
                        render: (r) => formatDateTime(r.created_at),
                      },
                      {
                        key: "action_type",
                        header: "Transaction type",
                        render: (r) => (
                          <Badge
                            tone={
                              r.action_type === "DEBIT" ? "debit" : "credit"
                            }
                          >
                            {r.action_type === "DEBIT"
                              ? "Deduction"
                              : "Deposit"}
                          </Badge>
                        ),
                      },
                      {
                        key: "amount_changed",
                        header: "Amount",
                        align: "right",
                        render: (r) => (
                          <Money value={r.amount_changed} signed />
                        ),
                      },
                      {
                        key: "balance_after",
                        header: "Recorded balance",
                        align: "right",
                        render: (r) => <Money value={r.balance_after} />,
                      },
                      {
                        key: "running_balance",
                        header: "Calculated balance",
                        align: "right",
                        render: (r) => (
                          <span
                            className={r.consistent ? "" : "text-danger"}
                            title={
                              r.consistent
                                ? "Balance verified"
                                : "Balance differs from the recorded value"
                            }
                          >
                            <Money value={r.running_balance} />{" "}
                            {r.consistent ? "✓" : "✗"}
                          </span>
                        ),
                      },
                    ]}
                  />

                  <Pagination
                    page={d.page}
                    totalPages={d.totalPages}
                    total={d.total}
                    isFetching={q.isFetching}
                    onPage={setPage}
                  />
                </>
              )}

              <details className="explain">
                <summary>How your balance is calculated</summary>
                <p>
                  Your current escrow balance is used to calculate earlier
                  balances by working backward through your transaction history.
                  Deposits increase your balance, while deductions decrease it.
                  Date filters affect which transactions are displayed, without
                  changing the balance calculations. Each transaction's
                  calculated balance is compared with its recorded balance.
                </p>
              </details>
            </Card>
          </>
        )}
      </QueryState>
    </>
  );
}

function TopUp({ clientId }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("5000");

  const m = useMutation({
    mutationFn: () => api.post(`/api/clients/${clientId}/topup`, { amount }),
    onSuccess: () => {
      ["escrow", "clients"].forEach((k) =>
        queryClient.invalidateQueries({ queryKey: [k] }),
      );
      setOpen(false);
    },
  });

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Add money
      </Button>
    );
  }

  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      <input
        className="input input-sm"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        aria-label="Top-up amount"
      />

      <Button type="submit" size="sm" loading={m.isPending}>
        Add
      </Button>

      <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
        Cancel
      </Button>

      {m.isError && <span className="text-danger">{m.error.message}</span>}
    </form>
  );
}
