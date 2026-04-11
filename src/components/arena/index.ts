/**
 * Arena Components Index
 *
 * Central export point for all Arena gamification components.
 */

// Common Components
export { default as GoldDisplay, GoldCoinIcon } from "./common/GoldDisplay";
export { default as SolDisplay, SolanaIcon } from "./common/SolDisplay";
export {
  default as ProgressBar,
  SegmentedProgressBar,
} from "./common/ProgressBar";
export {
  default as CountdownTimer,
  InlineCountdown,
} from "./common/CountdownTimer";
export { default as AssetPlaceholder } from "./common/AssetPlaceholder";

// Rank Components
export {
  default as RankBadge,
  RankIcon,
  getRankDisplayName,
  getRankColor,
  RANK_COLORS,
  RANK_NAMES,
  ROMAN_NUMERALS,
} from "./ranks/RankBadge";
export { default as RankCard } from "./ranks/RankCard";
export { default as RankCarousel } from "./ranks/RankCarousel";

// Quest Components
export { default as QuestCard, QuestRow } from "./quests/QuestCard";
export {
  default as QuestList,
  DailyQuestsSection,
  SeasonalQuestsSection,
  ReferralQuestsSection,
} from "./quests/QuestList";

// Leaderboard Components
export {
  default as LeaderboardPodium,
  CompactPodium,
} from "./leaderboard/LeaderboardPodium";
export {
  default as UserPositionBar,
  CompactUserPosition,
} from "./leaderboard/UserPositionBar";

// Referral Components
export {
  default as HonorsCard,
  HonorsTierComparison,
} from "./referrals/HonorsCard";
export {
  default as ReferralStatsCards,
  TierBreakdown,
} from "./referrals/ReferralStatsCards";
export { default as ReferralCodeShare } from "./referrals/ReferralCodeShare";
