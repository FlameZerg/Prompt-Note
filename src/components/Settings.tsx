import { Check } from 'lucide-react';
import Dialog from './Dialog';
import { palettes, type Palette } from '../utils/appearance';
import type { Messages } from '../locales/zh';
export default function Settings({ palette, t, onPalette, onClose }: {
  palette: Palette; t: Messages; onPalette: (value: Palette) => void; onClose: () => void;
}) {
  return <Dialog heading={t.settings} closeLabel={t.close} onClose={onClose}>
    <fieldset className="palette-settings">
      <legend>{t.colorTheme}</legend>
      <p>{t.colorThemeHint}</p>
      <div className="palette-grid">{palettes.map(value => <label key={value} data-palette={value} className={`palette-choice ${palette === value ? 'selected' : ''}`}>
        <input type="radio" name="palette" value={value} checked={palette === value} onChange={() => onPalette(value)} />
        <span className="palette-preview" aria-hidden="true"><span /><span /><span /></span>
        <span className="palette-name">{t[value]}<Check size={16} aria-hidden="true" /></span>
      </label>)}</div>
    </fieldset>
  </Dialog>;
}
