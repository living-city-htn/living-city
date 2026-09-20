export const PLANNING_GROUND = '#dcecff'

export function blockVisualState(mood: string | undefined, planning: boolean) {
  return {
    ground: planning ? PLANNING_GROUND : null,
    showFestivalGlow: mood === 'festive',
    showPlanningOutline: planning,
  }
}
