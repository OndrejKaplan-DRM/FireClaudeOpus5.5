// Registr assetů pro prohlížeč a export.
import * as P from './props.js';
import * as B from './big.js';
import * as V from './vegetation.js';
import * as P2 from './props2.js';

export const ASSETS = [
  { id: 'candle', name: 'Svíčka v mosazném svícnu', build: P.candle, size: 0.14, cat: 'rekvizity' },
  { id: 'torch', name: 'Louč v železném držáku', build: P.torch, size: 0.9, cat: 'rekvizity' },
  { id: 'campfireS', name: 'Ohýnek (malé ohniště)', build: (o) => P.campfire({ ...o, size: 'small' }), size: 0.7, cat: 'ohniště' },
  { id: 'campfire', name: 'Táborák (ohniště, týpí)', build: (o) => P.campfire({ ...o, size: 'medium' }), size: 1.5, cat: 'ohniště' },
  { id: 'bonfire', name: 'Velká hranice', build: (o) => P.campfire({ ...o, size: 'large' }), size: 2.4, cat: 'ohniště' },
  { id: 'tire', name: 'Pneumatika 205/55 R16 s diskem', build: P.tire, size: 0.7, cat: 'rekvizity' },
  { id: 'tirePile', name: 'Hromada 5 pneumatik', build: P.tirePile, size: 1.2, cat: 'rekvizity' },
  { id: 'barrel', name: 'Sud 200 l (ocel, lakovaný)', build: P.barrel, size: 1.0, cat: 'rekvizity' },
  { id: 'grenade', name: 'Ruční granát (typ M67)', build: P.grenade, size: 0.1, cat: 'výbušniny' },
  { id: 'tntDrum', name: 'Sud 1 t TNT na paletě', build: P.tntDrum, size: 1.4, cat: 'výbušniny' },
  { id: 'acetylene', name: 'PE sáček C₂H₂+O₂ a láhev', build: P.acetyleneBag, size: 1.4, cat: 'výbušniny' },
  { id: 'grinder', name: 'Úhlová bruska na nosníku IPE', build: P.grinderRig, size: 1.3, cat: 'rekvizity' },
  { id: 'puddle', name: 'Louže nafty s kanystrem', build: P.puddle, size: 4.4, cat: 'kapaliny' },
  { id: 'strawStack', name: 'Stoh slámy (velké balíky)', build: B.strawStack, size: 6, cat: 'velké' },
  { id: 'car', name: 'Osobní auto (sedan)', build: B.car, size: 5, cat: 'velké' },
  { id: 'house', name: 'Venkovský dům', build: B.house, size: 12, cat: 'velké' },
  { id: 'lighter', name: 'Plynový zapalovač (křesací)', build: P2.lighter, size: 0.09, cat: 'rekvizity' },
  { id: 'barrelOpen', name: 'Sud 200 l bez víka s naftou', build: P2.barrelOpen, size: 1.0, cat: 'kapaliny' },
  { id: 'gasCylinder', name: 'Acetylenová láhev 50 l', build: P2.gasCylinder, size: 1.3, cat: 'výbušniny' },
  { id: 'pallet', name: 'Europaleta', build: P2.pallet, size: 1.3, cat: 'rekvizity' },
  { id: 'crate', name: 'Dřevěná bedna 0,6 m', build: P2.crate, size: 0.8, cat: 'rekvizity' },
  { id: 'pine', name: 'Borovice 14 m', build: V.pine, size: 15, cat: 'vegetace' },
  { id: 'bush', name: 'Suchý keř', build: V.bush, size: 1.6, cat: 'vegetace' },
];
export const assetById = (id) => ASSETS.find((a) => a.id === id);
