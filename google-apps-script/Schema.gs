'use strict';
// Formula contract captured from the real matrix. Applied only to NEW operation rows.
const CASH_FORMULAS_ = {
  "12": "=IF(G25=\"\",\"\",IF(P25=\"Cancelado\",0,IF(I25=\"Cortesía\",0,IF(K25<>\"\",K25,IF(J25=\"\",\"\",J25))*H25)))",
  "13": "=IF(G25=\"\",\"\",IF(OR(B25=\"\",P25=\"Cancelado\",AD25=\"\",AD25=0),0,ROUND(MIN(1,SUMIFS(COBROS!$N$7:$N,COBROS!$C$7:$C,\"Caja\",COBROS!$D$7:$D,B25)/AD25)*L25,2)))",
  "14": "=IF(G25=\"\",\"\",MAX(0,L25-M25))",
  "15": "=IF(AND(G25<>\"\",B25<>\"\",N25>0,AG25=\"Efectivo\",AN25=\"\"),\"CAPTURA EFECTIVO RECIBIDO\",IF(AND(G25<>\"\",B25<>\"\",N25>0,AG25=\"Efectivo\",ISNUMBER(AN25),AN25<AQ25+N(AO25)),\"EFECTIVO INSUFICIENTE\",IF(AND(G25<>\"\",P25<>\"Cancelado\",REGEXMATCH(COMANDAS!M25,CHAR(34)&\"accountClosed\"&CHAR(34)&\":true\")),\"CUENTA CERRADA\",IF(AND(G25<>\"\",P25<>\"Cancelado\",N25>0.01,REGEXMATCH(COMANDAS!M25,CHAR(34)&\"credit\"&CHAR(34)&\":true\")),\"CUENTA ABIERTA · POR COBRAR\",IF(G25=\"\",\"\",IF(P25=\"Cancelado\",\"CANCELADO\",IF(W25=\"REPARTO POR CONFIRMAR\",IF(N25<=0.01,\"PAGADO · REPARTO PENDIENTE\",\"PAGO / REPARTO PENDIENTE\"),IF(W25<>\"LISTO\",IF(B25=\"\",\"FALTA CUENTA\",IF(E25=\"\",\"FALTA CLIENTE\",IF(H25<>1,\"UNA UNIDAD POR FILA\",IF(P25<>\"Enviar\",\"ELIGE ENVIAR\",W25)))),IF(L25=0,\"CORTESÍA\",IF(N25<=0.01,\"PAGADO\",IF(M25>0,\"PARCIAL\",\"PENDIENTE\")))))))))))",
  "20": "=IF(S25=\"Canna Treats\",IF(AND(W25=\"LISTO\",P25<>\"Cancelado\"),AB25,0),IF(AND(OR(X25=\"Entregada\",P25=\"Cancelado\"),IFERROR(VLOOKUP(G25,CATALOGO!$A$7:$O$326,10,FALSE),\"\")=\"Reparto\"),AB25,0))",
  "22": "=IF(AND(P25=\"Enviar\",X25=\"Entregada\",H25>0),H25,0)",
  "23": "=IF(G25=\"\",\"\",IF(P25=\"Cancelado\",\"CANCELADO\",IF(OR(B25=\"\",C25<SEMANA!$B$7,C25>=SEMANA!$B$8+1,C25=\"\",D25=\"\",H25<=0,I25=\"\",P25<>\"Enviar\"),\"FALTAN DATOS\",IF(OR(COUNTIFS($B$7:$B,B25,$C$7:$C,\"<>\"&C25)>0,COUNTIFS($B$7:$B,B25,$D$7:$D,\"<>\"&D25)>0,COUNTIFS($B$7:$B,B25,$E$7:$E,\"<>\"&E25)>0),\"TICKET REUTILIZADO · REVISAR\",IF(IFERROR(VLOOKUP(G25,CATALOGO!$A$7:$O$326,2,FALSE),\"\")<>F25,\"REVISAR CATEGORÍA\",IF(IFERROR(VLOOKUP(G25,CATALOGO!$A$7:$O$326,9,FALSE),\"\")<>\"Sí\",\"PRODUCTO INACTIVO\",IF(OR(NOT(ISNUMBER(R25)),S25=\"\",S25=0),\"REPARTO POR CONFIRMAR\",IF(AND(OR(I25=\"Cortesía\",K25<>\"\"),AE25=\"\"),\"FALTA AUTORIZACIÓN\",IF(AND(I25<>\"Cortesía\",K25=\"\",J25=\"\"),\"FALTA PRECIO\",\"LISTO\")))))))))",
  "24": "=IF(G25=\"\",\"\",IFERROR(INDEX(COMANDAS!$H$7:$H,MATCH(A25,COMANDAS!$A$7:$A,0)),\"\"))",
  "27": "=IF(AND(W25=\"LISTO\",ISNUMBER(R25)),ROUND(M25*R25,2),0)",
  "28": "=IF(AND(W25=\"LISTO\",ISNUMBER(R25)),ROUND(M25*(1-R25),2)-AL25,IF(P25=\"Cancelado\",-AL25,0))",
  "29": "=IF(V25=0,0,IFERROR(VLOOKUP(G25,CATALOGO!$A$7:$O$326,6,FALSE)*V25,0))",
  "30": "=IF(B25=\"\",\"\",SUMIFS($L$7:$L,$B$7:$B,B25,$P$7:$P,\"<>Cancelado\"))"
};

function cashFormulaWrites_(sheet, row) {
  return Object.keys(CASH_FORMULAS_).map(c => {
    const formula = CASH_FORMULAS_[c].replace(/(\$?[A-Z]{1,3})(\$?)(25)(?![0-9])/g,
      (all, col, absolute, n) => col + absolute + (absolute ? n : row));
    return cellWrite_(sheet, row, Number(c), formula, true);
  });
}
