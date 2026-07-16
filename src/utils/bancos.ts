export interface BancoPreset {
  nome: string;
  cor: string;
  sigla: string;
  textCor?: string;
}

export const BANCOS: BancoPreset[] = [
  { nome: 'Nubank',          cor: '#8a05be', sigla: 'Nu' },
  { nome: 'Inter',           cor: '#ff7a00', sigla: 'i' },
  { nome: 'Itaú',            cor: '#003399', sigla: 'It' },
  { nome: 'Bradesco',        cor: '#cc092f', sigla: 'B' },
  { nome: 'Banco do Brasil', cor: '#ffcc00', sigla: 'BB', textCor: '#003399' },
  { nome: 'Caixa',           cor: '#005ca9', sigla: 'Cx' },
  { nome: 'Santander',       cor: '#ec0000', sigla: 'S' },
  { nome: 'C6 Bank',         cor: '#242424', sigla: 'C6' },
  { nome: 'BTG Pactual',     cor: '#00214d', sigla: 'BT' },
  { nome: 'XP',              cor: '#000000', sigla: 'XP' },
  { nome: 'PicPay',          cor: '#21c25e', sigla: 'Pp' },
  { nome: 'Mercado Pago',    cor: '#009ee3', sigla: 'MP' },
  { nome: 'PagBank',         cor: '#00a650', sigla: 'PB' },
  { nome: 'Sicredi',         cor: '#3fa535', sigla: 'Si' },
  { nome: 'Banrisul',        cor: '#004a96', sigla: 'Br' },
  { nome: 'Neon',            cor: '#0dc5dc', sigla: 'Ne' },
  { nome: 'Safra',           cor: '#003d6b', sigla: 'Sa' },
  { nome: 'Original',        cor: '#00a650', sigla: 'Or' },
];

export function buscarBanco(nomeCartao: string): BancoPreset | null {
  const lower = nomeCartao.toLowerCase().trim();
  return BANCOS.find(b => lower === b.nome.toLowerCase() || lower.includes(b.nome.toLowerCase())) || null;
}
