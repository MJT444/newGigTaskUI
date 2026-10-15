// Readable view of one Portfolios document (the "flexible catalog").
//
// Every portfolio has freelancer_id, name and skills. The rest is OPTIONAL and
// differs per document (from the seeder: certifications ~70%, years_experience
// ~50%, bio ~40%, hourly_rate ~30%, languages ~20%). That variation is why it
// lives in MongoDB. The card renders whatever is present, says what is
// missing (struck through).
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { formatMoney } from '../../lib/format.js';
import { QueryState } from '../StateViews.jsx';
import { Card, DetailList } from '../ui.jsx';

export function PortfolioCard({ freelancerId }) {
  const q = useQuery({
    queryKey: ['portfolio', freelancerId],
    queryFn: () => api.get(`/api/freelancers/${freelancerId}/portfolio`),
    enabled: Boolean(freelancerId),
  });

  return (
    <Card title="Portfolio" subtitle="Skills, experience and certifications">
      <QueryState query={q} isEmpty={(d) => !d.portfolio} emptyTitle="This freelancer has no portfolio yet">
        {(d) => {
          const p = d.portfolio;
          const facts = [];
          if (p.years_experience !== undefined) facts.push(['Experience', `${p.years_experience} years`]);
          if (p.hourly_rate !== undefined) facts.push(['Hourly rate', formatMoney(p.hourly_rate)]);
          if (p.languages) facts.push(['Languages', p.languages.map((l) => l[0].toUpperCase() + l.slice(1)).join(', ')]);
          return (
            <div className="portfolio">
              <div className="portfolio-head">
                <div className="skill-chips" aria-label="Skills">
                  {(p.skills || []).map((s) => (
                    <span key={s} className="skill-chip">
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              {p.bio && <p className="portfolio-bio">{p.bio}</p>}
              {facts.length > 0 && <DetailList items={facts} />}

              {p.certifications?.length > 0 && (
                <div>
                  <span className="stat-label">Certifications</span>
                  <ul className="cert-list">
                    {p.certifications.map((c, i) => (
                      <li key={`${c.title}-${i}`} className="cert">
                        <strong>{c.title}</strong>
                        <span className="muted">
                          {c.issued_by} · {c.year}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            </div>
          );
        }}
      </QueryState>
    </Card>
  );
}
