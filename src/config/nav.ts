import {
  CalendarDaysIcon,
  DumbbellIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  SettingsIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: "/dashboard" | "/customers" | "/library" | "/routines" | "/plans" | "/settings";
  labelKey: "dashboard" | "customers" | "library" | "routines" | "plans" | "settings";
  icon: LucideIcon;
};

export const mainNav: NavItem[] = [
  { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboardIcon },
  { href: "/customers", labelKey: "customers", icon: UsersIcon },
  { href: "/library", labelKey: "library", icon: DumbbellIcon },
  { href: "/routines", labelKey: "routines", icon: ListChecksIcon },
  { href: "/plans", labelKey: "plans", icon: CalendarDaysIcon },
];

export const secondaryNav: NavItem[] = [
  { href: "/settings", labelKey: "settings", icon: SettingsIcon },
];

export const navGroups = {
  main: mainNav,
  secondary: secondaryNav,
  all: [...mainNav, ...secondaryNav],
} satisfies Record<string, NavItem[]>;

/** Serializable group name, so Server Components can choose a nav without passing icons. */
export type NavGroup = keyof typeof navGroups;
