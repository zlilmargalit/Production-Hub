import { useState } from 'react';
import { useT } from '../../i18n';

const localDateTimeNow = () => {
  const now = new Date();
  const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return localTime.toISOString().slice(0, 16);
};
const labelDate = (value) => value ? new Date(value).toLocaleString() : '';

export default function CommunicationLog({ project, members, canStructure, api, act }) {
  const { t } = useT();
  const [note, setNote] = useState('');
  const [occurredAt, setOccurredAt] = useState(localDateTimeNow());
  const [channel, setChannel] = useState('');
  const [contactText, setContactText] = useState('');
  const [contactMemberId, setContactMemberId] = useState(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [hasFollowUp, setHasFollowUp] = useState(false);
  const [followUpDate, setFollowUpDate] = useState('');

  const suggestions = members.filter((member) => (
    !contactText.trim() || member.label.toLocaleLowerCase().includes(contactText.trim().toLocaleLowerCase())
  ));

  const createEntry = () => act(async () => {
    const contact = contactMemberId
      ? { teamMemberId: contactMemberId }
      : contactText.trim() ? { externalName: contactText } : null;
    await api(`/${project.id}/communication-log`, 'POST', {
      note,
      occurredAt: new Date(occurredAt).toISOString(),
      channel: channel.trim() || null,
      contact,
      followUp: hasFollowUp ? { dueDate: followUpDate, status: 'open' } : null,
    });
    setNote('');
    setChannel('');
    setContactText('');
    setContactMemberId(null);
    setContactOpen(false);
    setHasFollowUp(false);
    setFollowUpDate('');
  });

  const updateFollowUp = (entry, status) => act(() => api(
    `/${project.id}/communication-log/${entry.id}`,
    'PUT',
    { followUp: { ...entry.followUp, status } },
  ));

  return <section className="pp-section">
    <h3>{t('productionProjects.communication')}</h3>
    <div className="pp-log">
      {project.communicationLog.length === 0 ? <p className="pp-empty">{t('productionProjects.noCommunication')}</p> : project.communicationLog.map((entry) => <article key={entry.id}>
        <div><strong dir="auto">{entry.authorNameSnapshot || t('productionProjects.unknownAuthor')}</strong><time dir="ltr">{labelDate(entry.occurredAt)}</time></div>
        {(entry.channel || entry.contact) && <p className="pp-log-contact">
          {entry.channel && <><span>{t('productionProjects.channel')}</span> <strong dir="auto">{entry.channel}</strong></>}
          {entry.channel && entry.contact && <span> · </span>}
          {entry.contact && <><span>{t('productionProjects.contact')}</span> <strong dir="auto">{entry.contact.nameSnapshot}</strong></>}
        </p>}
        <p dir="auto">{entry.note}</p>
        {entry.followUp && <div className={`pp-follow-up pp-follow-up--${entry.followUp.status}`}>
          <span>{t('productionProjects.followUp')}</span>
          <time dir="ltr">{entry.followUp.dueDate}</time>
          <span>{t(`productionProjects.followUpStatus.${entry.followUp.status}`)}</span>
          {canStructure && <span className="pp-follow-up-actions">
            {entry.followUp.status !== 'done' && <button type="button" className="pp-text-btn" onClick={() => updateFollowUp(entry, 'done')}>{t('productionProjects.followUpDone')}</button>}
            {entry.followUp.status !== 'cancelled' && <button type="button" className="pp-text-btn" onClick={() => updateFollowUp(entry, 'cancelled')}>{t('productionProjects.followUpCancel')}</button>}
            {entry.followUp.status !== 'open' && <button type="button" className="pp-text-btn" onClick={() => updateFollowUp(entry, 'open')}>{t('productionProjects.followUpReopen')}</button>}
          </span>}
        </div>}
      </article>)}
    </div>

    <div className="pp-log-add">
      <div className="pp-contact-control">
        <label htmlFor={`pp-contact-${project.id}`}>{t('productionProjects.contact')}</label>
        <input id={`pp-contact-${project.id}`} role="combobox" aria-autocomplete="list" aria-expanded={contactOpen} aria-controls={`pp-contact-options-${project.id}`} value={contactText} dir="auto" placeholder={t('productionProjects.contactPlaceholder')} onFocus={() => setContactOpen(true)} onBlur={() => setContactOpen(false)} onChange={(event) => { setContactText(event.target.value); setContactMemberId(null); setContactOpen(true); }} />
        {contactMemberId && <small>{t('productionProjects.contactTeamMember')}</small>}
        {contactOpen && suggestions.length > 0 && <div id={`pp-contact-options-${project.id}`} className="pp-contact-options" role="listbox">{suggestions.map((member) => <button type="button" role="option" aria-selected={contactMemberId === member.id} key={member.id} dir="auto" onMouseDown={(event) => { event.preventDefault(); setContactText(member.label); setContactMemberId(member.id); setContactOpen(false); }}>{member.label}</button>)}</div>}
      </div>
      <input value={channel} maxLength={200} dir="auto" placeholder={t('productionProjects.channelPlaceholder')} aria-label={t('productionProjects.channel')} onChange={(event) => setChannel(event.target.value)} />
      <textarea value={note} dir="auto" placeholder={t('productionProjects.note')} onChange={(event) => setNote(event.target.value)} />
      <input type="datetime-local" value={occurredAt} dir="ltr" aria-label={t('productionProjects.occurredAt')} onChange={(event) => setOccurredAt(event.target.value)} />
      <label className="pp-follow-up-toggle"><input type="checkbox" checked={hasFollowUp} onChange={(event) => { setHasFollowUp(event.target.checked); if (!event.target.checked) setFollowUpDate(''); }} /> {t('productionProjects.addFollowUp')}</label>
      {hasFollowUp && <input type="date" value={followUpDate} dir="ltr" aria-label={t('productionProjects.followUpDate')} onChange={(event) => setFollowUpDate(event.target.value)} />}
      <button type="button" className="btn-ghost" disabled={!note.trim() || !occurredAt || (hasFollowUp && !followUpDate)} onClick={createEntry}>{t('productionProjects.addNote')}</button>
    </div>
  </section>;
}
