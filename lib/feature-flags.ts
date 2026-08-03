export type FeatureFlags = {
  integrations: {
    gmail: boolean;
    whatsapp: boolean;
    slack: boolean;
    outlook: boolean;
    discord: boolean;
    linkedin: boolean;
    calendly: boolean;
    telegram: boolean;
    google_calendar: boolean;
    teams: boolean;
    notion: boolean;
  };
  surfaces: {
    aiAgent: boolean;
    alerts: boolean;
    briefing: boolean;
    inbox: boolean;
  };
};

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  integrations: {
    gmail: true,
    whatsapp: true,
    slack: true,
    outlook: true,
    discord: true,
    linkedin: true,
    calendly: true,
    telegram: true,
    google_calendar: true,
    teams: true,
    notion: true,
  },
  surfaces: {
    aiAgent: true,
    alerts: true,
    briefing: true,
    inbox: true,
  },
};
