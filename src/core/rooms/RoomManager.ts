import { getAgentSet } from '../../data/agents';
import { useTeamStore } from '../../integration/store/teamStore';
import { AgentSimulation } from '../../simulation/core/AgentSimulation';

/**
 * 部屋（チーム）ごとの AgentSimulation の持ち主。
 *
 * 以前は 3D の SceneManager が唯一の AgentSimulation を持ち、部屋を切り替えると
 * dispose して作り直していた。つまり**部屋を出ると仕事が止まって消えた**。
 *
 * AgentSimulation は状態（coreStore）だけを見て動く純粋なサービス層で、
 * 3D に依存していない。だからここで部屋ごとに1つずつ持ち、ページが生きている間は
 * 動かし続ける。3D は「いま入っている部屋を覗く窓」でしかなくなる。
 *
 * 作るのは初めて使われたとき（入室・依頼時）。使っていない部屋の心拍を
 * 起動時から回してもコストは小さいが、無意味なので遅延にしてある。
 */
class RoomManagerImpl {
  private sims = new Map<string, AgentSimulation>();

  /** 部屋のシミュレーションを返す。無ければ作って動かし始める。 */
  public ensure(roomId: string): AgentSimulation {
    const existing = this.sims.get(roomId);
    if (existing) return existing;

    const system = getAgentSet(roomId, useTeamStore.getState().customSystems);
    const sim = new AgentSimulation(system);
    this.sims.set(roomId, sim);
    return sim;
  }

  public get(roomId: string): AgentSimulation | undefined {
    return this.sims.get(roomId);
  }

  /** 動いている部屋のID一覧（表示用）。 */
  public activeRoomIds(): string[] {
    return [...this.sims.keys()];
  }

  /**
   * チーム定義を編集したときだけ作り直す。
   * （進行中の履歴は coreStore 側にあるので、作り直しても部屋の状態は残る）
   */
  public rebuild(roomId: string): AgentSimulation {
    const existing = this.sims.get(roomId);
    if (existing) {
      existing.dispose();
      this.sims.delete(roomId);
    }
    return this.ensure(roomId);
  }

  public disposeAll() {
    this.sims.forEach((sim) => sim.dispose());
    this.sims.clear();
  }
}

export const roomManager = new RoomManagerImpl();

// チーム定義（自作チーム）が編集されたら、その部屋のシミュレーションを作り直す。
// 進行中の履歴・タスクは coreStore 側に残るので、失われない。
let prevCustom = useTeamStore.getState().customSystems;
useTeamStore.subscribe((state) => {
  if (state.customSystems === prevCustom) return;
  const changed = state.customSystems.filter((sys) => {
    const before = prevCustom.find((p) => p.id === sys.id);
    return before && before !== sys;
  });
  prevCustom = state.customSystems;
  changed.forEach((sys) => {
    if (roomManager.get(sys.id)) roomManager.rebuild(sys.id);
  });
});
