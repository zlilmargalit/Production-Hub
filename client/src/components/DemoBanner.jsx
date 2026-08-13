import { useT } from '../i18n';

function DemoBanner() {
  const { t } = useT();
  return (
    <div className="demo-banner">
      <span className="demo-banner-icon">🎭</span>
      <span>
        <strong>{t('demo.title')}</strong> — {t('demo.description')}
      </span>
    </div>
  );
}

export default DemoBanner;
