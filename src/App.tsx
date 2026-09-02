/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { autoConnectBridge } from './core/bridge/bridgeClient';
import { getOfficeTheme, useAppearanceStore } from './integration/store/appearanceStore';
import { useCoreStore } from './integration/store/coreStore';
import { ActionLogPanel } from './interface/ActionLogPanel';
import CharacterBook from './interface/CharacterBook';
import { FinalOutputModal } from './interface/FinalOutputModal';
import FloorView from './interface/FloorView';
import Header from './interface/Header';
import InspectorPanel from './interface/InspectorPanel';
import { KanbanPanel } from './interface/KanbanPanel';
import { OutputReviewModal } from './interface/OutputReviewModal';
import SimulationView from './interface/SimulationView';
import { VisualConfigurator } from './interface/VisualConfigurator/VisualConfigurator';
import { SceneContext } from './simulation/SceneContext';
import { SceneManager } from './simulation/SceneManager';
import { workflowEngine } from './core/workflow/WorkflowEngine';


const App: React.FC = () => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const managerRef = useRef<SceneManager | null>(null);
  const [sceneManager, setSceneManager] = useState<SceneManager | null>(null);
  const { isLogOpen, isKanbanOpen, setIsResizing, viewMode, setViewMode } = useCoreStore();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [kanbanHeight, setKanbanHeight] = useState(220);

  const startResizing = useCallback(() => {
    setIsResizing(true);
  }, [setIsResizing]);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, [setIsResizing]);

  const resize = useCallback((e: MouseEvent) => {
    if (useCoreStore.getState().isResizing) {
      const windowHeight = window.innerHeight;
      const newHeight = windowHeight - e.clientY;
      const minHeight = windowHeight * 0.2;
      const maxHeight = windowHeight * 0.5;
      if (newHeight >= minHeight && newHeight <= maxHeight) {
        setKanbanHeight(newHeight);
      }
    }
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResizing);
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [resize, stopResizing]);

  // 職員室の背景色。担任が選んだものを 3D 側へ渡す
  const officeThemeId = useAppearanceStore((s) => s.themeId);
  useEffect(() => {
    sceneManager?.setBackgroundColor(getOfficeTheme(officeThemeId).background);
  }, [sceneManager, officeThemeId]);

  // 教材フォルダのブリッジは起動のたびに繋ぎ直す（設定済みなら CEO の操作は要らない）
  useEffect(() => {
    void autoConnectBridge();
  }, []);

  // ワークフロー制御層。案件の工程を進めるのはこれだけで、
  // 承認①を通っていない案件には手を出さない（docs/system-redesign.md §3）
  useEffect(() => {
    workflowEngine.start();
    return () => workflowEngine.stop();
  }, []);

  useEffect(() => {
    if (canvasRef.current && !managerRef.current) {
      const manager = new SceneManager(canvasRef.current);
      managerRef.current = manager;
      setSceneManager(manager);
    }

    return () => {
      if (managerRef.current) {
        managerRef.current.dispose();
        managerRef.current = null;
        setSceneManager(null);
      }
    };
  }, []);

  return (
    <SceneContext.Provider value={sceneManager}>
      <div className="w-screen h-screen bg-white overflow-hidden flex flex-col">
        {/* Top: Header */}
        {!isFullscreen && <Header />}

        <div className="flex-1 flex flex-row min-h-0 min-w-0 overflow-hidden">
          {/* Left: Log panel */}
          {isLogOpen && !isFullscreen && viewMode === 'simulation' && <ActionLogPanel />}

          {/* Center: canvas + kanban drawer stacked */}
          <div className="relative flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-zinc-50">

            {/* フロア図（全部屋の俯瞰）。既定の画面 */}
            {viewMode === 'floor' && <FloorView />}

            {/* 担当図鑑。誰に何を頼めるかの索引 */}
            {viewMode === 'characters' && <CharacterBook />}

            {/* Simulation Context - Persistently Mounted */}
            <div
              className={viewMode === 'simulation' ? 'flex-1 flex flex-col min-w-0 min-h-0' : 'hidden'}
            >
              <SimulationView canvasRef={canvasRef} isFullscreen={isFullscreen} setIsFullscreen={setIsFullscreen} />

              {/* Resize Bar */}
              {isKanbanOpen && !isFullscreen && (
                <div
                  className={`h-2 hover:h-2 bg-transparent hover:bg-zinc-200 border-t border-black/5 transition-colors cursor-row-resize z-30 flex items-center justify-center group shrink-0 ${useCoreStore.getState().isResizing ? 'bg-zinc-300' : ''}`}
                  onMouseDown={startResizing}
                >
                  <div className="w-12 h-1 bg-zinc-300 rounded-full group-hover:bg-zinc-400" />
                </div>
              )}

              {isKanbanOpen && !isFullscreen && <KanbanPanel height={kanbanHeight} />}
            </div>
          </div>

          {/* Right: Inspector sidebar */}
          {!isFullscreen && viewMode === 'simulation' && <InspectorPanel />}
        </div>

        {/* Design Mode Overlay (Modal) */}
        {viewMode === 'design' && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-3 md:p-6 bg-white/40 backdrop-blur-xl"
          >
            <div
              className="w-full h-full bg-white rounded-2xl shadow-2xl border border-zinc-200/50 overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <VisualConfigurator />
            </div>
          </div>
        )}

        {/* Final output — fixed viewport overlay */}
        <FinalOutputModal />
        <OutputReviewModal />
      </div>
    </SceneContext.Provider>
  );
};

export default App;

