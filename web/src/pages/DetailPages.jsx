// Detail view per record: client, freelancer, contract.
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client.js";
import { ContractStatusControl } from "../components/ContractStatusControl.jsx";
import { FreelancerState } from "../components/pickers.jsx";
import { PortfolioCard } from "../components/mongo/PortfolioCard.jsx";
import { QueryState } from "../components/StateViews.jsx";
import {
  Button,
  Card,
  DetailList,
  Money,
  PageHeader,
  StatCard,
} from "../components/ui.jsx";
import { useActor } from "../context/ActorContext.jsx";
import { formatDateTime, formatInt } from "../lib/format.js";

function BackLink({ tab }) {
  const { state } = useLocation();
  const search = state?.browseSearch;
  const params = new URLSearchParams(search || "");
  if (!params.has("tab")) params.set("tab", tab);
  return (
    <Link className="back-link" to={`/explore?${params}`}>
      ← Back to {tab}
    </Link>
  );
}

export function ClientDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { actor, setActor } = useActor();
  const q = useQuery({
    queryKey: ["clients", "detail", id],
    queryFn: () => api.get(`/api/clients/${id}`),
  });

  return (
    <QueryState query={q}>
      {(c) => (
        <>
          <BackLink tab="clients" />
          <PageHeader
            title={c.name}
            description="Account and contract overview"
          >
            <Button
              variant={actor?.id === c.id ? "secondary" : "primary"}
              disabled={actor?.id === c.id}
              onClick={() => setActor({ id: c.id, name: c.name })}
            >
              {actor?.id === c.id
                ? "You are acting as this client"
                : "Act as this client"}
            </Button>
          </PageHeader>
          <div className="stats-grid">
            <StatCard
              label="Escrow balance"
              value={<Money value={c.escrow_balance} />}
            />
            <StatCard
              label="Contracts"
              value={formatInt(c.stats.total_contracts)}
              hint={`${formatInt(c.stats.completed)} completed`}
            />
            <StatCard
              label="Funded / in progress"
              value={`${formatInt(c.stats.funded)} / ${formatInt(c.stats.in_progress)}`}
            />
            <StatCard
              label="Total budgets"
              value={<Money value={c.stats.total_budget} />}
              hint={`last ${formatDateTime(c.stats.last_contract_at)}`}
            />
          </div>
          <Card title="Shortcuts">
            <div className="button-row">
              <Button
                onClick={() => {
                  setActor({ id: c.id, name: c.name });
                  navigate("/fund");
                }}
              >
                Fund a gig as this client
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setActor({ id: c.id, name: c.name });
                  navigate("/escrow");
                }}
              >
                Escrow audit trail
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setActor({ id: c.id, name: c.name });
                  navigate("/explore?tab=contracts&mine=1");
                }}
              >
                Their contracts
              </Button>
            </div>
          </Card>
        </>
      )}
    </QueryState>
  );
}

export function FreelancerDetailPage() {
  const { id } = useParams();
  const q = useQuery({
    queryKey: ["freelancers", "detail", id],
    queryFn: () => api.get(`/api/freelancers/${id}`),
  });

  return (
    <QueryState query={q}>
      {(f) => (
        <>
          <BackLink tab="freelancers" />
          <PageHeader title={f.name} description="Freelancer profile">
            <FreelancerState f={f} />
          </PageHeader>
          <div className="stats-grid">
            <StatCard
              label="Completed gig earnings"
              value={<Money value={f.stats.earnings} />}
              hint="Current total"
            />
            <StatCard label="Completed" value={formatInt(f.stats.completed)} />
            <StatCard
              label="Funded, not started"
              value={formatInt(f.stats.funded)}
            />
            <StatCard
              label="Lifetime earnings"
              value={
                f.lifetimeStatsView ? (
                  <Money value={f.lifetimeStatsView.total_earnings} />
                ) : (
                  "—"
                )
              }
              hint={
                !f.lifetimeStatsView
                  ? "Update the revenue summary in Analytics"
                  : Number(f.lifetimeStatsView.total_earnings) !==
                      Number(f.stats.earnings)
                    ? "May be outdated — update the revenue summary"
                    : "From the latest revenue summary"
              }
              tone={
                f.lifetimeStatsView &&
                Number(f.lifetimeStatsView.total_earnings) !==
                  Number(f.stats.earnings)
                  ? "danger"
                  : undefined
              }
            />
          </div>
          <div className="grid-2">
            <Card title="Details">
              <DetailList
                items={[
                  ["Base latitude", Number(f.latitude).toFixed(5)],
                  ["Base longitude", Number(f.longitude).toFixed(5)],
                  [
                    "Can start a new gig",
                    f.is_available && !f.in_progress_contract_id ? "Yes" : "No",
                  ],
                  [
                    "Gig in progress",
                    f.in_progress_contract_id ? (
                      <Link
                        key="c"
                        to={`/contracts/${f.in_progress_contract_id}`}
                      >
                        Open contract
                      </Link>
                    ) : (
                      "None"
                    ),
                  ],
                ]}
              />
            </Card>
            <Card title="Open in">
              <div className="button-row">
                <Link
                  className="btn btn-secondary"
                  to={`/analytics?freelancer=${f.id}`}
                >
                  Revenue chart
                </Link>
                <Link
                  className="btn btn-secondary"
                  to={`/reviews?freelancer=${f.id}`}
                >
                  Reviews
                </Link>
                <Link
                  className="btn btn-secondary"
                  to={`/workers?lat=${Number(f.latitude).toFixed(5)}&lng=${Number(f.longitude).toFixed(5)}`}
                >
                  Workers near their base
                </Link>
                <Link
                  className="btn btn-secondary"
                  to={`/fund?freelancer=${f.id}`}
                >
                  Fund a gig for them
                </Link>
              </div>
            </Card>
          </div>
          <PortfolioCard freelancerId={f.id} />
        </>
      )}
    </QueryState>
  );
}

export function ContractDetailPage() {
  const { id } = useParams();
  const q = useQuery({
    queryKey: ["contract", id],
    queryFn: () => api.get(`/api/contracts/${id}`),
  });

  return (
    <QueryState query={q}>
      {(k) => (
        <>
          <BackLink tab="contracts" />
          <PageHeader
            title="Contract"
            description={`${k.client_name} and ${k.freelancer_name}`}
          />
          <div className="grid-2">
            <Card title="Summary">
              <DetailList
                items={[
                  [
                    "Client",
                    <Link key="c" to={`/clients/${k.client_id}`}>
                      {k.client_name}
                    </Link>,
                  ],
                  [
                    "Freelancer",
                    <Link key="f" to={`/freelancers/${k.freelancer_id}`}>
                      {k.freelancer_name}
                    </Link>,
                  ],
                  ["Budget", <Money key="b" value={k.budget} />],
                  ["Funded", formatDateTime(k.created_at)],
                ]}
              />
            </Card>
            <Card
              title="Status"
              subtitle="A freelancer can work on one gig at a time"
            >
              <ContractStatusControl contract={k} />
            </Card>
          </div>
        </>
      )}
    </QueryState>
  );
}
