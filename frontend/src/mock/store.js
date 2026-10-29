export const SCENARIO_STORAGE_KEY = 'wj:v1:mock:scenario'
export function readScenario() {
  try {
    const v = window.localStorage.getItem(SCENARIO_STORAGE_KEY)
    return v ? v : null
  } catch {
    return null
  }
}
