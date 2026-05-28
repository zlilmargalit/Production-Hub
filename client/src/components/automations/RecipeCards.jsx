import { useState } from 'react';

const RECIPES = [
  {
    id:          'email-to-shows',
    emoji:       '✉️',
    name:        'Email → Show',
    desc:        'When a booking email arrives in Gmail, automatically create a new show with the details extracted from the subject and body.',
    color:       '#EA4335',
    requires:    'Requires Gmail',
    triggerType: 'email',
    actionType:  'create-show',
    defaultConditions: [
      { field: 'subject', op: 'contains', value: 'booking', logic: null },
    ],
    defaultParams: { nameTemplate: '[Subject]' },
  },
  {
    id:          'auto-folders',
    emoji:       '📁',
    name:        'Auto Folders',
    desc:        'When a new show is added, create a matching Google Drive folder named after the artist and date so files always land in the right place.',
    color:       '#34A853',
    requires:    'Requires Google Drive',
    triggerType: 'show-event',
    actionType:  'create-folder',
    defaultConditions: [],
    defaultParams: { folderTemplate: '[Artist] — [Show Date] — [Venue]' },
  },
  {
    id:          'early-coord',
    emoji:       '⏰',
    name:        'Early Coordination Alert',
    desc:        'Get a push notification 14 days before every show so you have time to confirm sound, lighting, and logistics well in advance.',
    color:       '#F08D39',
    requires:    'Requires push notifications',
    triggerType: 'schedule',
    actionType:  'push',
    defaultConditions: [
      { field: 'daysBeforeShow', op: 'equals', value: '14', logic: null },
    ],
    defaultParams: {
      message:        'Heads up — [Show Name] is in 14 days! ([Show Date] · [Venue])',
      daysBeforeShow: 14,
    },
  },
];

export default function RecipeCards({ automations, onActivate }) {
  const [activating, setActivating] = useState(null);

  const isActive = (recipeId) => automations.some((a) => a.recipeId === recipeId && a.active);

  const handleActivate = async (recipe) => {
    if (isActive(recipe.id)) return; // already active
    setActivating(recipe.id);
    try {
      await onActivate({
        label:      recipe.name,
        triggerType: recipe.triggerType,
        conditions:  recipe.defaultConditions,
        actionType:  recipe.actionType,
        actionParams: recipe.defaultParams,
        isRecipe:    true,
        recipeId:    recipe.id,
      });
    } finally {
      setActivating(null);
    }
  };

  return (
    <div className="recipe-grid">
      {RECIPES.map((recipe) => {
        const active = isActive(recipe.id);
        return (
          <div key={recipe.id} className="recipe-card">
            <div className="recipe-band" style={{ '--et-color': recipe.color }} />
            <div className="recipe-body">
              <div className="recipe-icon-row">
                <span className="recipe-name">{recipe.name}</span>
              </div>
              <p className="recipe-desc">{recipe.desc}</p>
              <span className="recipe-requires">{recipe.requires}</span>
            </div>
            <div className="recipe-foot">
              <button
                className={`recipe-btn${active ? ' recipe-btn--active' : ''}`}
                style={{ '--et-color': recipe.color }}
                onClick={() => handleActivate(recipe)}
                disabled={active || activating === recipe.id}
              >
                {activating === recipe.id
                  ? 'Activating…'
                  : active
                  ? '✓ Active'
                  : 'Activate recipe'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
