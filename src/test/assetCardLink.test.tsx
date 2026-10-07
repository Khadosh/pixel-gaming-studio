import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useParams, useLocation } from 'react-router-dom';
import AssetCard from '@/components/AssetCard';
import { ASSET_CATALOG, getAssetById } from '@/lib/assets';
import { parseSpec } from '@/lib/slugUtils';

let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;

/**
 * jsdom no tiene contexto 2d y la tarjeta dibuja el sprite al montarse.
 * Un contexto que no hace nada alcanza: acá lo que se mide es el enlace.
 */
beforeEach(() => {
  originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string) {
    if (type !== '2d') return null;
    const noop = () => {};
    const ctx = {
      canvas: this,
      fillStyle: '',
      strokeStyle: '',
      font: '',
      textAlign: '',
      textBaseline: '',
      imageSmoothingEnabled: false,
      globalAlpha: 1,
      clearRect: noop,
      fillRect: noop,
      strokeRect: noop,
      fillText: noop,
      strokeText: noop,
      beginPath: noop,
      closePath: noop,
      moveTo: noop,
      lineTo: noop,
      stroke: noop,
      fill: noop,
      save: noop,
      restore: noop,
      translate: noop,
      scale: noop,
      drawImage: noop,
      setTransform: noop,
      measureText: () => ({ width: 0 }),
    };
    return ctx as unknown as CanvasRenderingContext2D;
  } as typeof HTMLCanvasElement.prototype.getContext;
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  cleanup();
});

/** Lo que hace AssetDetail con el parámetro de la ruta: parsear y buscar. */
function AssetProbe() {
  const { assetSlug } = useParams<{ assetSlug: string }>();
  const asset = getAssetById(parseSpec(assetSlug || ''));
  return <div data-testid="resolved">{asset ? asset.id : 'ASSET NOT FOUND'}</div>;
}

describe('el enlace de cada tarjeta del catálogo', () => {
  it.each(ASSET_CATALOG.map(a => [a.id, a.name] as const))(
    'abre la ficha del asset %s ("%s")',
    (id) => {
      const asset = getAssetById(id)!;
      render(
        <MemoryRouter initialEntries={['/catalog']}>
          <Routes>
            <Route path="/catalog" element={<AssetCard asset={asset} />} />
            <Route path="/asset/:assetSlug" element={<AssetProbe />} />
          </Routes>
        </MemoryRouter>
      );

      fireEvent.click(screen.getByRole('button'));

      // El slug del nombre ("WARRIOR (16PX)" → warrior-16px) nunca fue un id:
      // llevaba a ASSET NOT FOUND para las quince tarjetas del catálogo.
      expect(screen.getByTestId('resolved').textContent).toBe(asset.id);
    }
  );

  it('conserva el projectSlug en la query al abrir la ficha', () => {
    const asset = ASSET_CATALOG[0];
    function PathProbe() {
      const { assetSlug } = useParams<{ assetSlug: string }>();
      const { search } = useLocation();
      return <div data-testid="destino">{`${assetSlug}${search}`}</div>;
    }
    render(
      <MemoryRouter initialEntries={['/catalog']}>
        <Routes>
          <Route path="/catalog" element={<AssetCard asset={asset} projectSlug="mi-proyecto" />} />
          <Route path="/asset/:assetSlug" element={<PathProbe />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByTestId('destino').textContent).toBe(
      `${asset.id}?projectSlug=mi-proyecto`
    );
  });
});
