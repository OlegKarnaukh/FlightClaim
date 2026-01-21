'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { LocalClaim } from '../page';

const statusLabels: Record<LocalClaim['status'], string> = {
  CREATED: 'PDF создан',
  SENT: 'Отправлено',
  FOLLOW_UP: 'Follow-up отправлен',
  ESCALATED: 'Эскалация',
  PAID: 'Компенсация получена',
  REFUNDED: 'Возврат оформлен',
};

const statusColors: Record<LocalClaim['status'], string> = {
  CREATED: '#6b7280',
  SENT: '#2563eb',
  FOLLOW_UP: '#f59e0b',
  ESCALATED: '#dc2626',
  PAID: '#10b981',
  REFUNDED: '#8b5cf6',
};

const responseLabels: Record<string, string> = {
  NONE: 'Нет ответа',
  REQUESTED_DOCS: 'Запросили документы',
  REJECTED: 'Отказали',
  ACCEPTED: 'Приняли',
};

export default function ClaimDetailPage() {
  const router = useRouter();
  const params = useParams();
  const claimId = params.id as string;

  const [claim, setClaim] = useState<LocalClaim | null>(null);
  const [loading, setLoading] = useState(true);
  const [showResponseModal, setShowResponseModal] = useState(false);

  useEffect(() => {
    loadClaim();
  }, [claimId]);

  const loadClaim = () => {
    const stored = localStorage.getItem('flightclaim_claims');
    if (stored) {
      try {
        const claims = JSON.parse(stored) as LocalClaim[];
        const found = claims.find((c) => c.id === claimId);
        setClaim(found || null);
      } catch (e) {
        console.error('Error parsing claims:', e);
      }
    }
    setLoading(false);
  };

  const updateClaim = (updates: Partial<LocalClaim>) => {
    const stored = localStorage.getItem('flightclaim_claims');
    if (!stored || !claim) return;

    const claims = JSON.parse(stored) as LocalClaim[];
    const index = claims.findIndex((c) => c.id === claimId);
    if (index === -1) return;

    const updated = { ...claims[index], ...updates };
    claims[index] = updated;
    localStorage.setItem('flightclaim_claims', JSON.stringify(claims));
    setClaim(updated);
  };

  const markAsSent = () => {
    updateClaim({
      status: 'SENT',
      sentAt: new Date().toISOString(),
    });
  };

  const markFollowUpSent = () => {
    updateClaim({
      status: 'FOLLOW_UP',
      followUpAt: new Date().toISOString(),
    });
  };

  const markEscalated = () => {
    updateClaim({
      status: 'ESCALATED',
      escalatedAt: new Date().toISOString(),
    });
  };

  const markPaid = () => {
    updateClaim({
      status: 'PAID',
      airlineResponse: 'ACCEPTED',
      resolvedAt: new Date().toISOString(),
    });
  };

  const setAirlineResponse = (response: LocalClaim['airlineResponse']) => {
    updateClaim({ airlineResponse: response });
    setShowResponseModal(false);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const getDaysSince = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  };

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.loading}>Загрузка...</div>
      </div>
    );
  }

  if (!claim) {
    return (
      <div style={styles.page}>
        <div style={styles.notFound}>
          <h2>Претензия не найдена</h2>
          <button style={styles.backBtn} onClick={() => router.push('/claims')}>
            Вернуться к списку
          </button>
        </div>
      </div>
    );
  }

  const daysSinceCreated = getDaysSince(claim.createdAt);
  const daysSinceSent = claim.sentAt ? getDaysSince(claim.sentAt) : null;
  const canRequestRefund = daysSinceCreated >= 120 && claim.status !== 'PAID';

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <button style={styles.backArrow} onClick={() => router.push('/claims')}>
            ←
          </button>
          <span style={styles.headerTitle}>Претензия</span>
        </div>
        <div style={styles.logo} onClick={() => router.push('/')}>FlightClaim</div>
      </header>

      <main style={styles.main}>
        {/* Flight Summary */}
        <div style={styles.flightCard}>
          <div style={styles.flightTop}>
            <div>
              <div style={styles.flightNumber}>{claim.flightNumber}</div>
              <div style={styles.route}>
                {claim.departureCity} → {claim.arrivalCity}
              </div>
              <div style={styles.flightDate}>{formatDate(claim.flightDate)}</div>
            </div>
            <div style={styles.compensationBig}>€{claim.compensation}</div>
          </div>
          <div style={styles.passengerInfo}>
            {claim.firstName} {claim.lastName}
          </div>
        </div>

        {/* Status Section */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Статус претензии</h2>

          <div
            style={{
              ...styles.currentStatus,
              background: statusColors[claim.status] + '15',
              borderColor: statusColors[claim.status],
            }}
          >
            <span style={{ color: statusColors[claim.status], fontWeight: 600 }}>
              {statusLabels[claim.status]}
            </span>
            {claim.airlineResponse && claim.airlineResponse !== 'NONE' && (
              <span style={styles.responseTag}>
                {responseLabels[claim.airlineResponse]}
              </span>
            )}
          </div>

          {/* Timeline */}
          <div style={styles.timeline}>
            <TimelineItem
              label="PDF создан"
              date={claim.createdAt}
              isComplete={true}
              isCurrent={claim.status === 'CREATED'}
            />
            <TimelineItem
              label="Отправлено в авиакомпанию"
              date={claim.sentAt}
              isComplete={!!claim.sentAt}
              isCurrent={claim.status === 'SENT'}
            />
            <TimelineItem
              label="Follow-up отправлен"
              date={claim.followUpAt}
              isComplete={!!claim.followUpAt}
              isCurrent={claim.status === 'FOLLOW_UP'}
            />
            <TimelineItem
              label="Эскалация в нац. орган"
              date={claim.escalatedAt}
              isComplete={!!claim.escalatedAt}
              isCurrent={claim.status === 'ESCALATED'}
            />
            <TimelineItem
              label={claim.status === 'REFUNDED' ? 'Возврат оформлен' : 'Компенсация получена'}
              date={claim.resolvedAt}
              isComplete={!!claim.resolvedAt}
              isCurrent={claim.status === 'PAID' || claim.status === 'REFUNDED'}
              isLast
            />
          </div>
        </div>

        {/* Actions Section */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Действия</h2>

          {/* Instructions based on airline response */}
          {claim.airlineResponse === 'REQUESTED_DOCS' && claim.status !== 'PAID' && (
            <div style={styles.actionCard}>
              <div style={styles.actionHeader}>
                <span style={styles.actionIcon}>📄</span>
                <span style={styles.actionTitle}>Авиакомпания запросила документы</span>
              </div>
              <p style={styles.actionText}>
                Отправьте им следующие документы:
              </p>
              <ul style={styles.docList}>
                <li>Посадочный талон (boarding pass)</li>
                <li>Подтверждение бронирования (email или PDF)</li>
                <li>Копия паспорта (страница с фото)</li>
                <li>Если есть — чеки на еду/отель во время задержки</li>
              </ul>
              <p style={styles.actionHint}>
                После отправки документов ожидайте ответа в течение 14-30 дней.
              </p>
              <button
                style={styles.secondaryBtn}
                onClick={() => updateClaim({ airlineResponse: 'NONE' })}
              >
                Документы отправлены, жду ответа
              </button>
            </div>
          )}

          {claim.airlineResponse === 'REJECTED' && claim.status !== 'PAID' && (
            <div style={styles.actionCard}>
              <div style={styles.actionHeader}>
                <span style={styles.actionIcon}>❌</span>
                <span style={styles.actionTitle}>Авиакомпания отказала</span>
              </div>
              <p style={styles.actionText}>
                Не сдавайтесь! Вот что можно сделать:
              </p>
              <div style={styles.rejectionOptions}>
                <div style={styles.rejectionOption}>
                  <strong>1. Запросите обоснование</strong>
                  <p>Напишите: "Прошу предоставить официальное обоснование отказа со ссылкой на конкретные обстоятельства рейса {claim.flightNumber}."</p>
                </div>
                <div style={styles.rejectionOption}>
                  <strong>2. Проверьте причину отказа</strong>
                  <p>Авиакомпании часто ссылаются на "форс-мажор", но должны доказать это документально. Запросите METAR-отчёт или документы о технической неисправности.</p>
                </div>
                <div style={styles.rejectionOption}>
                  <strong>3. Эскалируйте жалобу</strong>
                  <p>Подайте жалобу в национальный авиационный орган страны вылета.</p>
                </div>
              </div>
              <button style={styles.primaryBtn} onClick={markEscalated}>
                Подать жалобу в нац. орган
              </button>
              <button
                style={{ ...styles.secondaryBtn, marginTop: 8 }}
                onClick={() => updateClaim({ airlineResponse: 'NONE' })}
              >
                Отправил запрос на обоснование
              </button>
            </div>
          )}

          {claim.airlineResponse === 'ACCEPTED' && claim.status !== 'PAID' && (
            <div style={styles.successCard}>
              <div style={styles.actionHeader}>
                <span style={styles.actionIcon}>🎉</span>
                <span style={styles.actionTitle}>Авиакомпания согласилась выплатить!</span>
              </div>
              <p style={styles.actionText}>
                Отлично! Обычно выплата происходит в течение 7-30 дней на указанный IBAN.
              </p>
              <p style={styles.actionHint}>
                Когда деньги поступят на счёт, нажмите кнопку ниже.
              </p>
            </div>
          )}

          {claim.status === 'CREATED' && (
            <div style={styles.actionCard}>
              <div style={styles.actionHeader}>
                <span style={styles.actionIcon}>📧</span>
                <span style={styles.actionTitle}>Отправьте претензию</span>
              </div>
              <p style={styles.actionText}>
                Отправьте PDF на email авиакомпании:
              </p>
              <div style={styles.emailBox}>{claim.airlineEmail}</div>
              <p style={styles.actionHint}>
                Приложите к письму посадочный талон и подтверждение бронирования.
              </p>
              <button style={styles.primaryBtn} onClick={markAsSent}>
                Я отправил претензию
              </button>
            </div>
          )}

          {claim.status === 'SENT' && (
            <>
              {daysSinceSent !== null && daysSinceSent >= 14 ? (
                <div style={styles.actionCard}>
                  <div style={styles.actionHeader}>
                    <span style={styles.actionIcon}>⏰</span>
                    <span style={styles.actionTitle}>Пора отправить follow-up</span>
                  </div>
                  <p style={styles.actionText}>
                    Прошло {daysSinceSent} дней. Авиакомпания не ответила — напомните о себе.
                  </p>
                  <p style={styles.actionHint}>
                    Отправьте повторное письмо с напоминанием о вашей претензии.
                  </p>
                  <button style={styles.primaryBtn} onClick={markFollowUpSent}>
                    Я отправил follow-up
                  </button>
                </div>
              ) : (
                <div style={styles.waitingCard}>
                  <p>Ожидаем ответа авиакомпании...</p>
                  <p style={styles.waitingHint}>
                    Обычно авиакомпании отвечают в течение 14-30 дней.
                    {daysSinceSent !== null && (
                      <> Прошло {daysSinceSent} дней.</>
                    )}
                  </p>
                </div>
              )}

              <button
                style={styles.secondaryBtn}
                onClick={() => setShowResponseModal(true)}
              >
                Пришёл ответ от авиакомпании
              </button>
            </>
          )}

          {claim.status === 'FOLLOW_UP' && (
            <>
              <div style={styles.actionCard}>
                <div style={styles.actionHeader}>
                  <span style={styles.actionIcon}>🏛️</span>
                  <span style={styles.actionTitle}>Эскалация в национальный орган</span>
                </div>
                <p style={styles.actionText}>
                  Если авиакомпания не отвечает, подайте жалобу в национальный авиационный орган.
                </p>
                <p style={styles.actionHint}>
                  Для рейсов из ЕС: орган страны вылета. Для рейсов в ЕС на европейской авиакомпании: орган страны прилёта.
                </p>
                <button style={styles.primaryBtn} onClick={markEscalated}>
                  Я подал жалобу
                </button>
              </div>

              <button
                style={styles.secondaryBtn}
                onClick={() => setShowResponseModal(true)}
              >
                Пришёл ответ от авиакомпании
              </button>
            </>
          )}

          {claim.status === 'ESCALATED' && (
            <>
              <div style={styles.waitingCard}>
                <p>Жалоба подана в национальный орган</p>
                <p style={styles.waitingHint}>
                  Обычно рассмотрение занимает 30-90 дней.
                </p>
              </div>

              <button
                style={styles.secondaryBtn}
                onClick={() => setShowResponseModal(true)}
              >
                Пришёл ответ
              </button>
            </>
          )}

          {claim.status !== 'PAID' && claim.status !== 'REFUNDED' && (
            <button style={styles.successBtn} onClick={markPaid}>
              Компенсацию выплатили!
            </button>
          )}

          {canRequestRefund && claim.status !== 'REFUNDED' && (
            <div style={styles.refundCard}>
              <p>Прошло более 120 дней и компенсация не получена?</p>
              <button style={styles.refundBtn}>
                Запросить возврат €9.99
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Response Modal */}
      {showResponseModal && (
        <div style={styles.modalOverlay} onClick={() => setShowResponseModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Что ответила авиакомпания?</h3>

            <button
              style={styles.responseOption}
              onClick={() => setAirlineResponse('REQUESTED_DOCS')}
            >
              📄 Запросили дополнительные документы
            </button>

            <button
              style={styles.responseOption}
              onClick={() => setAirlineResponse('REJECTED')}
            >
              ❌ Отказали в компенсации
            </button>

            <button
              style={styles.responseOption}
              onClick={() => setAirlineResponse('ACCEPTED')}
            >
              ✅ Согласились выплатить
            </button>

            <button
              style={styles.cancelBtn}
              onClick={() => setShowResponseModal(false)}
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TimelineItem({
  label,
  date,
  isComplete,
  isCurrent,
  isLast,
}: {
  label: string;
  date?: string;
  isComplete: boolean;
  isCurrent: boolean;
  isLast?: boolean;
}) {
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  return (
    <div style={styles.timelineItem}>
      <div style={styles.timelineDot}>
        <div
          style={{
            ...styles.dot,
            background: isComplete ? '#10b981' : '#e5e7eb',
            border: isCurrent ? '3px solid #10b981' : 'none',
          }}
        >
          {isComplete && <span style={styles.checkmark}>✓</span>}
        </div>
        {!isLast && (
          <div
            style={{
              ...styles.timelineLine,
              background: isComplete ? '#10b981' : '#e5e7eb',
            }}
          />
        )}
      </div>
      <div style={styles.timelineContent}>
        <span style={{ fontWeight: isCurrent ? 600 : 400 }}>{label}</span>
        {date && <span style={styles.timelineDate}>{formatDate(date)}</span>}
      </div>
    </div>
  );
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
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  backArrow: {
    background: 'none',
    border: 'none',
    fontSize: 20,
    cursor: 'pointer',
    padding: '4px 8px',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 500,
  },
  logo: {
    fontSize: 20,
    fontWeight: 700,
    color: '#2563eb',
    cursor: 'pointer',
  },
  main: {
    maxWidth: 600,
    margin: '0 auto',
    padding: 24,
  },
  loading: {
    textAlign: 'center',
    padding: 48,
    color: '#6b7280',
  },
  notFound: {
    textAlign: 'center',
    padding: 48,
  },
  backBtn: {
    marginTop: 16,
    padding: '10px 20px',
    background: '#2563eb',
    color: 'white',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
  },
  flightCard: {
    background: 'white',
    borderRadius: 12,
    padding: 20,
    border: '1px solid #e5e7eb',
    marginBottom: 24,
  },
  flightTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  flightNumber: {
    fontSize: 24,
    fontWeight: 700,
  },
  route: {
    color: '#6b7280',
    marginTop: 4,
  },
  flightDate: {
    color: '#9ca3af',
    fontSize: 14,
    marginTop: 4,
  },
  compensationBig: {
    fontSize: 32,
    fontWeight: 700,
    color: '#10b981',
  },
  passengerInfo: {
    marginTop: 16,
    paddingTop: 16,
    borderTop: '1px solid #f3f4f6',
    color: '#6b7280',
  },
  section: {
    background: 'white',
    borderRadius: 12,
    padding: 20,
    border: '1px solid #e5e7eb',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 600,
    marginBottom: 16,
  },
  currentStatus: {
    padding: '12px 16px',
    borderRadius: 8,
    border: '1px solid',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  responseTag: {
    fontSize: 12,
    background: '#f3f4f6',
    padding: '4px 8px',
    borderRadius: 4,
    color: '#6b7280',
  },
  timeline: {
    marginTop: 20,
  },
  timelineItem: {
    display: 'flex',
    gap: 12,
  },
  timelineDot: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  dot: {
    width: 24,
    height: 24,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    color: 'white',
    fontSize: 12,
    fontWeight: 700,
  },
  timelineLine: {
    width: 2,
    height: 32,
    marginTop: 4,
    marginBottom: 4,
  },
  timelineContent: {
    display: 'flex',
    flexDirection: 'column',
    paddingBottom: 20,
  },
  timelineDate: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  actionCard: {
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: 12,
    padding: 20,
    marginBottom: 12,
  },
  actionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  actionIcon: {
    fontSize: 24,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: 600,
  },
  actionText: {
    color: '#374151',
    marginBottom: 8,
  },
  actionHint: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 16,
  },
  emailBox: {
    background: 'white',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    padding: '10px 14px',
    fontFamily: 'monospace',
    marginBottom: 12,
  },
  waitingCard: {
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: 20,
    textAlign: 'center',
    marginBottom: 12,
  },
  waitingHint: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 8,
  },
  primaryBtn: {
    width: '100%',
    background: '#2563eb',
    color: 'white',
    border: 'none',
    padding: '14px',
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
  },
  secondaryBtn: {
    width: '100%',
    background: 'white',
    color: '#374151',
    border: '1px solid #d1d5db',
    padding: '12px',
    borderRadius: 8,
    fontSize: 14,
    cursor: 'pointer',
    marginBottom: 12,
  },
  successBtn: {
    width: '100%',
    background: '#10b981',
    color: 'white',
    border: 'none',
    padding: '14px',
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 8,
  },
  refundCard: {
    marginTop: 24,
    padding: 16,
    background: '#fef3c7',
    borderRadius: 8,
    textAlign: 'center',
  },
  refundBtn: {
    marginTop: 12,
    background: '#f59e0b',
    color: 'white',
    border: 'none',
    padding: '10px 20px',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 500,
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: 'white',
    borderRadius: 16,
    padding: 24,
    maxWidth: 400,
    width: '90%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 600,
    marginBottom: 20,
    textAlign: 'center',
  },
  responseOption: {
    width: '100%',
    padding: '14px 16px',
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    fontSize: 14,
    textAlign: 'left',
    cursor: 'pointer',
    marginBottom: 8,
  },
  cancelBtn: {
    width: '100%',
    padding: '12px',
    background: 'transparent',
    border: 'none',
    color: '#6b7280',
    fontSize: 14,
    cursor: 'pointer',
    marginTop: 8,
  },
  docList: {
    margin: '12px 0',
    paddingLeft: 20,
    lineHeight: 1.8,
  },
  rejectionOptions: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    margin: '16px 0',
  },
  rejectionOption: {
    background: 'white',
    padding: 16,
    borderRadius: 8,
    border: '1px solid #e5e7eb',
  },
  successCard: {
    background: '#ecfdf5',
    border: '1px solid #a7f3d0',
    borderRadius: 12,
    padding: 20,
    marginBottom: 12,
  },
};
