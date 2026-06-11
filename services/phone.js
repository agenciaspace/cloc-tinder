/* ---------------------------------------------------------------------------
   Normalização de telefone (foco Brasil, código 55).

   O WhatsApp guarda alguns celulares BR sem o "9" depois do DDD (numeração
   antiga de 8 dígitos), enquanto o app de hoje usa 9 dígitos. Para casar os
   dois lados de forma confiável, reduzimos tudo a uma forma CANÔNICA única:

     móvel:    55 + DDD(2) + 9 + assinante(8)   -> 13 dígitos
     fixo:     55 + DDD(2) + assinante(8)        -> 12 dígitos

   Assim "(11) 98765-4321", "5511987654321" e o JID antigo "551187654321"
   convergem para o mesmo valor.
   --------------------------------------------------------------------------- */

function digitsOnly(raw) {
  return String(raw || '').replace(/\D+/g, '');
}

// Recebe dígitos crus e devolve { ddd, rest } já com o país tratado, ou null.
function splitBr(digits) {
  let d = digits;
  if (d.startsWith('00')) d = d.slice(2);        // prefixo internacional
  // adiciona o 55 quando veio em formato local (DDD + número = 10 ou 11)
  if (!d.startsWith('55') && (d.length === 10 || d.length === 11)) d = '55' + d;
  if (!d.startsWith('55')) return null;          // país desconhecido / inválido
  const local = d.slice(2);                      // tira o 55
  if (local.length < 10 || local.length > 11) return null;
  return { ddd: local.slice(0, 2), rest: local.slice(2) };
}

// Forma canônica (com 9 para celular). Retorna string ou null se não der pra normalizar.
function canonical(raw) {
  const parts = splitBr(digitsOnly(raw));
  if (!parts) return null;
  const { ddd, rest } = parts;

  if (rest.length === 9 && rest[0] === '9') {
    return '55' + ddd + rest;                    // já é celular com 9
  }
  if (rest.length === 8) {
    const first = rest[0];
    if (first >= '6' && first <= '9') {           // celular antigo (8 díg) -> insere o 9
      return '55' + ddd + '9' + rest;
    }
    return '55' + ddd + rest;                     // fixo (8 díg) — fica como está
  }
  return null;
}

// Conjunto de variantes (com e sem o 9) — útil para buscas tolerantes.
function variants(raw) {
  const c = canonical(raw);
  if (!c) return [];
  const set = new Set([c]);
  const local = c.slice(2);                       // DDD + número
  const ddd = local.slice(0, 2);
  const num = local.slice(2);
  if (num.length === 9 && num[0] === '9') {
    set.add('55' + ddd + num.slice(1));           // versão sem o 9
  }
  return [...set];
}

module.exports = { digitsOnly, canonical, variants };
