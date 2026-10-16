export interface AclCategoryInfo {
  name: string;
  description: string;
}

export interface AclUserItem {
  username: string;
  enabled: boolean;
  hasPassword: boolean;
  isNoPass: boolean;
  passwordCount: number;
  keysSummary: string;
  channelsSummary: string;
  allowedCategories: string[];
  deniedCategories: string[];
  allowedCommands: string[];
  deniedCommands: string[];
  rawRule: string;
  isDefault: boolean;
}

export interface AclRuleObject {
  username: string;
  enabled: boolean;
  password?: string;
  nopass?: boolean;
  keys: string[];
  channels: string[];
  categories: {
    allowed: string[];
    denied: string[];
  };
  commands: {
    allowed: string[];
    denied: string[];
  };
}

export interface AclTestResult {
  user: string;
  command: string;
  allowed: boolean;
  reason: string;
  decidingRule: string;
}

export interface SecurityStatus {
  authRequired: boolean;
  tlsEnabled: boolean;
  defaultUserState: {
    enabled: boolean;
    hasPassword: boolean;
    isDangerousAllowed: boolean;
    summary: string;
  };
  recommendations: string[];
}
