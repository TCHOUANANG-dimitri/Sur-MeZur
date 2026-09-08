"use client";

/**
 * Jeu d'icones de l'application.
 *
 * L'application mobile utilise `lucide-react-native` ; le web utilise
 * `lucide-react`, qui est le meme trait dessine par le meme projet. Les deux
 * interfaces partagent donc exactement la meme famille d'icones, ce qu'aucun
 * emoji ne permettait : un emoji est rendu par la police du systeme, il change
 * d'aspect entre Android, iOS et Windows, ne se colore pas, et ne s'aligne pas
 * sur une grille optique commune avec le reste de l'interface.
 *
 * Ce fichier centralise les correspondances pour qu'un changement d'icone se
 * fasse a un seul endroit, et pour que l'import de `lucide-react` reste
 * confine (l'arborescence de la bibliotheque est vaste).
 */

export {
  // Navigation principale
  House as IconHome,
  Shirt as IconModels,
  Ruler as IconMeasure,
  User as IconProfile,
  LayoutDashboard as IconDashboard,
  BadgeCheck as IconVerify,
  FolderOpen as IconCatalog,
  Users as IconUsers,
  Package as IconOrders,
  Scale as IconDisputes,
  Star as IconReviews,
  Percent as IconCommission,

  // Actions et etats
  ChevronLeft as IconBack,
  ChevronDown as IconChevronDown,
  ChevronRight as IconChevronRight,
  Eye as IconEye,
  EyeOff as IconEyeOff,
  Camera as IconCamera,
  Check as IconCheck,
  Download as IconDownload,
  Printer as IconPrint,
  Search as IconSearch,
  TriangleAlert as IconWarning,
  Inbox as IconEmpty,
  LogOut as IconLogout,
  RefreshCw as IconRetry,
  Info as IconInfo,
  ShieldCheck as IconShield,
} from "lucide-react";
