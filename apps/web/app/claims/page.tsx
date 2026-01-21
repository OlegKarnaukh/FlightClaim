'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Claim stored in localStorage
export interface LocalClaim {
  id: string;
  // Flight info
  flightNumber: string;
  airline: string;
  airlineEmail: string;
  departureCity: string;
  arrivalCity: string;
  flightDate: string;
  delayMinutes: number;
  compensation: number;
  // Passenger
  firstName: string;
  lastName: string;
  email: string;
  // Status
  status: 'CREATED' | 'SENT' | 'FOLLOW_UP' | 'ESCALATED' | 'PAID' | 'REFUNDED';
  airlineResponse?: 'NONE' | 'REQUESTED_DOCS' | 'REJECTED' | 'ACCEPTED';
  // Dates
  createdAt: string;
  sentAt?: string;
  followUpAt?: string;
  escalatedAt?: string;
  resolvedAt?: string;
}

const statusLabels: Record<LocalClaim['status'], string> = {
  CREATED: 'PDF создан',
  SENT: 'Отправлено',
  FOLLOW_UP: 'Follow-up',
  ESCALATED: 'Эскалация',
  PAID: 'Выплачено',
  REFUNDED: 'Возврат',
};

const statusColors: Record<LocalClaim['status'], string> = {
  CREATED: '#6b7280',
  SENT: '#2563eb',
  FOLLOW_UP: '#f59e0b',
  ESCALATED: '#dc2626',
  PAID: '#10b981',
  REFUNDED: '#8b5cf6',
};

export default function ClaimsPage() {
  const router = useRouter();
  const [claims, setClaims] = useState<LocalClaim[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load claims from localStorage
    const stored = localStorage.getItem('flightclaim_claims');
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as LocalClaim[];
        // Sort by createdAt desc
        parsed.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setClaims(parsed);
      } catch (e) {
        console.error('Error parsing claims:', e);
      }
    }
    setLoading(false);
  }, []);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const getDaysSince = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  };

  const getNextAction = (claim: LocalClaim): { text: string; urgent: boolean } | null => {
    const daysSinceCreated = getDaysSince(claim.createdAt);
    const daysSinceSent = claim.sentAt ? getDaysSince(claim.sentAt) : null;

    if (claim.status === 'CREATED') {
      return { text: 'Отправьте претензию авиакомпании', urgent: true };
    }
    if (claim.status === 'SENT' && daysSinceSent !== null && daysSinceSent >= 14) {
      return { text: 'Пора отправить follow-up', urgent: true };
    }
    if (claim.status === 'FOLLOW_UP') {
      const daysSinceFollowUp = claim.followUpAt ? getDaysSince(claim.followUpAt) : daysSinceSent;
      if (daysSinceFollowUp && daysSinceFollowUp >= 16) {
        return { text: 'Пора эскалировать в нац. орган', urgent: true };
      }
    }
    if (claim.status === 'PAID' || claim.status === 'REFUNDED') {
      return null;
    }
    return null;
  };

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.loading}>Загрузка...</div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.logo} onClick={() => router.push('/')}>FlightClaim</div>
      </header>

      <main style={styles.main}>
        <h1 style={styles.title}>Мои претензии</h1>

        {claims.length === 0 ? (
          <div style={styles.empty}>
            <div style={styles.emptyIcon}>📋</div>
            <h2 style={styles.emptyTitle}>Пока нет претензий</h2>
            <p style={styles.emptyText}>
              Загрузите посадочный талон чтобы проверить право на компенсацию
            </p>
            <button style={styles.newClaimBtn} onClick={() => router.push('/')}>
              Проверить рейс
            </button>
          </div>
        ) : (
          <div style={styles.claimsList}>
            {claims.map((claim) => {
              const nextAction = getNextAction(claim);
              return (
                <div
                  key={claim.id}
                  style={styles.claimCard}
                  onClick={() => router.push(`/claims/${claim.id}`)}
                >
                  <div style={styles.cardTop}>
                    <div style={styles.flightInfo}>
                      <span style={styles.flightNumber}>{claim.flightNumber}</span>
                      <span style={styles.route}>
                        {claim.departureCity} → {claim.arrivalCity}
                      </span>
                      <span style={styles.date}>{formatDate(claim.flightDate)}</span>
                    </div>
                    <div style={styles.compensationAmount}>€{claim.compensation}</div>
                  </div>

                  <div style={styles.cardMiddle}>
                    <div style={styles.statusRow}>
                      <span
                        style={{
                          ...styles.statusBadge,
                          background: statusColors[claim.status] + '20',
                          color: statusColors[claim.status],
                        }}
                      >
                        {statusLabels[claim.status]}
                      </span>
                      <span style={styles.createdAt}>
                        Создано {formatDate(claim.createdAt)}
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div style={styles.progressContainer}>
                      <div style={styles.progressTrack}>
                        <div
                          style={{
                            ...styles.progressFill,
                            width: getProgressWidth(claim.status),
                            background: statusColors[claim.status],
                          }}
                        />
                      </div>
                      <div style={styles.progressLabels}>
                        <span style={getStepStyle(claim.status, 'CREATED')}>PDF</span>
                        <span style={getStepStyle(claim.status, 'SENT')}>Отправлено</span>
                        <span style={getStepStyle(claim.status, 'FOLLOW_UP')}>Follow-up</span>
                        <span style={getStepStyle(claim.status, 'ESCALATED')}>Эскалация</span>
                        <span style={getStepStyle(claim.status, 'PAID')}>Выплата</span>
                      </div>
                    </div>
                  </div>

                  {nextAction && (
                    <div
                      style={{
                        ...styles.actionBanner,
                        background: nextAction.urgent ? '#fef3c7' : '#eff6ff',
                        color: nextAction.urgent ? '#92400e' : '#1e40af',
                      }}
                    >
                      {nextAction.urgent && '⚠️ '}
                      {nextAction.text}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function getProgressWidth(status: LocalClaim['status']): string {
  const stages: LocalClaim['status'][] = ['CREATED', 'SENT', 'FOLLOW_UP', 'ESCALATED', 'PAID'];
  const index = stages.indexOf(status);
  if (status === 'REFUNDED') return '100%';
  return `${((index + 1) / stages.length) * 100}%`;
}

function getStepStyle(
  currentStatus: LocalClaim['status'],
  stepStatus: LocalClaim['status']
): React.CSSProperties {
  const stages: LocalClaim['status'][] = ['CREATED', 'SENT', 'FOLLOW_UP', 'ESCALATED', 'PAID'];
  const currentIndex = stages.indexOf(currentStatus);
  const stepIndex = stages.indexOf(stepStatus);
  const isActive = stepIndex <= currentIndex;

  return {
    fontSize: 10,
    color: isActive ? '#374151' : '#9ca3af',
    fontWeight: isActive ? 500 : 400,
  };
}

const styles: { [key: string]: React.CSSProperties } = {
  page: {
    minHeight: '100vh',
    background: '#f9fafb',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 24px',
    background: 'white',
    borderBottom: '1px solid #e5e7eb',
  },
  logo: {
    fontSize: 24,
    fontWeight: 700,
    color: '#2563eb',
    cursor: 'pointer',
  },
  main: {
    maxWidth: 700,
    margin: '0 auto',
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 600,
    marginBottom: 24,
  },
  loading: {
    textAlign: 'center',
    padding: 48,
    color: '#6b7280',
  },
  empty: {
    textAlign: 'center',
    padding: '48px 24px',
    background: 'white',
    borderRadius: 16,
    border: '1px solid #e5e7eb',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 600,
    marginBottom: 8,
  },
  emptyText: {
    color: '#6b7280',
    marginBottom: 24,
  },
  newClaimBtn: {
    background: '#2563eb',
    color: 'white',
    border: 'none',
    padding: '12px 24px',
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 500,
    cursor: 'pointer',
  },
  claimsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  claimCard: {
    background: 'white',
    borderRadius: 12,
    border: '1px solid #e5e7eb',
    overflow: 'hidden',
    cursor: 'pointer',
    transition: 'box-shadow 0.2s',
  },
  cardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '16px 20px',
    borderBottom: '1px solid #f3f4f6',
  },
  flightInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  flightNumber: {
    fontSize: 18,
    fontWeight: 600,
  },
  route: {
    color: '#6b7280',
    fontSize: 14,
  },
  date: {
    color: '#9ca3af',
    fontSize: 13,
  },
  compensationAmount: {
    fontSize: 24,
    fontWeight: 700,
    color: '#10b981',
  },
  cardMiddle: {
    padding: '16px 20px',
  },
  statusRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusBadge: {
    padding: '4px 10px',
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 500,
  },
  createdAt: {
    fontSize: 12,
    color: '#9ca3af',
  },
  progressContainer: {
    marginTop: 8,
  },
  progressTrack: {
    height: 4,
    background: '#e5e7eb',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    transition: 'width 0.3s',
  },
  progressLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  actionBanner: {
    padding: '10px 20px',
    fontSize: 13,
    fontWeight: 500,
  },
};
