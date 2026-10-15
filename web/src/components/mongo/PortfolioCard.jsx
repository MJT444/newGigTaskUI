// Readable view of one Portfolios document (the "flexible catalog").
//
// Every portfolio has freelancer_id, name and skills. The rest is OPTIONAL and
// differs per document (from the seeder: certifications ~70%, years_experience
// ~50%, bio ~40%, hourly_rate ~30%, languages ~20%). That variation is why it
// lives in MongoDB. The card renders whatever is present, says what is
// missing, and can show the raw document.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { formatMoney } from '../../lib/format.js';
import { QueryState } from '../StateViews.jsx';
import { Button, Card, DetailList } from '../ui.jsx';

const FIELD_LABELS = {
  certifications: 'Certifications',
  years_experience: 'Years of experience',
  bio: 'Bio',
  hourly_rate: 'Hourly rate',
  languages: 'Languages',
};

export function PortfolioCard({ freelancerId }) {
  const [showRaw, setShowRaw] = useState(false);
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
                <div className="field-presence" aria-label="Profile details filled in">
                  {d.presentOptionalFields.map((k) => (
                    <span key={k} className="present">✓ {FIELD_LABELS[k]}</span>
                  ))}
                  {d.missingOptionalFields.map((k) => (
                    <span key={k} className="absent">{FIELD_LABELS[k]}</span>
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

              <div className="portfolio-footer">
                <span className="muted">Profiles differ: each one stores only the details the freelancer added.</span>
                <Button variant="ghost" size="sm" onClick={() => setShowRaw((s) => !s)} aria-expanded={showRaw}>
                  {showRaw ? 'Hide' : 'Show'} stored document
                </Button>
              </div>
              {showRaw && (
                <>
                  <p className="muted">
                    MongoDB <code>Portfolios</code> document <code>{String(p._id)}</code>; <code>freelancer_id</code> = PostgreSQL{' '}
                    <code>freelancers.id</code>.
                  </p>
                  <pre className="raw-json">{JSON.stringify(p, null, 2)}</pre>
                </>
              )}
            </div>
          );
        }}
      </QueryState>
    </Card>
  );
}
