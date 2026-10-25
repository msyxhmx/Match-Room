// Which screen the match is on: half-time and full-time once their brief is in, the live
// screen otherwise (including the moment between the 45' tick and its brief).

import { FullTimeScreen, HalfTimeScreen } from "./BreakScreens";
import { LiveScreen, type LiveScreenProps } from "./LiveScreen";

export type MatchScreenProps = LiveScreenProps & { revealed?: number };

export function MatchScreen(props: MatchScreenProps) {
  const { view } = props;
  if (view.period === "HT" && view.halftime) return <HalfTimeScreen {...props} />;
  if (view.period === "FT" && view.fulltime) return <FullTimeScreen {...props} />;
  return <LiveScreen {...props} />;
}
