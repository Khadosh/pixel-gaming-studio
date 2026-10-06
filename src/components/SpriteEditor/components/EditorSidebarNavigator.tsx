import React from 'react';
import { PxFilm, PxLayers, PxPalette, PxSword, PxSettings, PxClock, PxBone, PxSparkles } from '@/components/icons/PixelIcon';
import { useSpriteEditorStore } from '../context/SpriteEditorContext';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export const EditorSidebarNavigator = () => {
  const activeTab = useSpriteEditorStore(s => s.leftSidebarTab);
  const setTab = useSpriteEditorStore(s => s.setLeftSidebarTab);

  const tabs = [
    { id: 'animations', icon: PxFilm, label: 'ANIMS' },
    { id: 'layers', icon: PxLayers, label: 'LAYERS' },
    { id: 'anatomy', icon: PxBone, label: 'BONES' },
    { id: 'procedural', icon: PxSparkles, label: 'FX' },
    { id: 'themes', icon: PxPalette, label: 'THEMES' },
    { id: 'assets', icon: PxSword, label: 'ASSETS' },
    { id: 'history', icon: PxClock, label: 'HISTORY' },
    { id: 'config', icon: PxSettings, label: 'CONFIG' },
  ] as const;

  return (
    <div className="w-[64px] flex-shrink-0 bg-background/90 border-l border-border flex flex-col items-center py-4 gap-3 select-none overflow-hidden">
      <TooltipProvider delayDuration={0}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          
          return (
            <Tooltip key={tab.id}>
              <TooltipTrigger asChild>
                <Button
                  variant={isActive ? 'secondary' : 'ghost'}
                  className={`w-12 transition-all duration-300 flex flex-col items-center gap-3 ${
                    isActive 
                      ? 'h-auto py-4 bg-primary/20 text-primary border border-primary/40 shadow-[0_0_15px_rgba(34,197,94,0.15)]' 
                      : 'h-12 py-0 text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                  }`}
                  onClick={() => setTab(tab.id)}
                >
                  <tab.icon size={isActive ? 20 : 18} />
                  {isActive && (
                    <span className="[writing-mode:vertical-rl] rotate-180 nube-etiqueta nube-track-2 uppercase animate-in fade-in slide-in-from-bottom-1">
                      {tab.label}
                    </span>
                  )}
                </Button>
              </TooltipTrigger>
              {!isActive && (
                <TooltipContent side="left" sideOffset={10}>
                  <span className="nube-cuerpo uppercase">{tab.label}</span>
                </TooltipContent>
              )}
            </Tooltip>
          );
        })}
      </TooltipProvider>
    </div>
  );
};
