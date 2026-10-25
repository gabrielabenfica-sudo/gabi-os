import { describe, expect, it } from "vitest";
import { detectFormat, guessCsvMapping, parseAmount, parseCsv, parseDate, parseOfx, splitCsvLine } from "./import-parsers";

describe("valores e datas", () => {
  it("valores brasileiros e internacionais", () => {
    expect(parseAmount("1.234,56")).toBe(123456);
    expect(parseAmount("-1.234,56")).toBe(-123456);
    expect(parseAmount("R$ 1.234,56")).toBe(123456);
    expect(parseAmount("-1234.56")).toBe(-123456);
    expect(parseAmount("1,234.56")).toBe(123456);
    expect(parseAmount("(123,45)")).toBe(-12345);
    expect(parseAmount("150")).toBe(15000);
    expect(parseAmount("12,5")).toBe(1250);
    expect(parseAmount("123,45 D")).toBe(-12345);
    expect(parseAmount("123,45 C")).toBe(12345);
    expect(parseAmount("50,00-")).toBe(-5000);
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("")).toBeNull();
  });
  it("datas", () => {
    expect(parseDate("05/10/2026")).toBe("2026-10-05");
    expect(parseDate("5/1/26")).toBe("2026-01-05");
    expect(parseDate("2026-10-05")).toBe("2026-10-05");
    expect(parseDate("20261005120000[-3:BRT]")).toBe("2026-10-05");
    expect(parseDate("31/02/2026")).toBeNull();
    expect(parseDate("saldo")).toBeNull();
  });
});

const OFX_SGML = `OFXHEADER:100
DATA:OFXSGML
VERSION:102

<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<CURDEF>BRL
<BANKACCTFROM><BANKID>0260<ACCTID>12345-6<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261003000000[-3:BRT]
<TRNAMT>-89.90
<FITID>a1b2c3
<MEMO>Compra no débito - MERCADO &amp; CIA
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261005
<TRNAMT>2500.00
<FITID>a1b2c4
<NAME>PIX RECEBIDO
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261006
<TRNAMT>10.00
<FITID>a1b2c4
<MEMO>Estorno
</STMTTRN>
</BANKTRANLIST>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;

describe("OFX", () => {
  it("lê OFX 1.x (sem fechamento de tags), conta e moeda; FITID repetido vira único", () => {
    const r = parseOfx(OFX_SGML);
    expect(r.errors).toEqual([]);
    expect(r.account).toBe("12345-6");
    expect(r.currency).toBe("BRL");
    expect(r.rows).toEqual([
      { line: 1, date: "2026-10-03", description: "Compra no débito - MERCADO & CIA", amountCents: -8990, externalId: "a1b2c3" },
      { line: 2, date: "2026-10-05", description: "PIX RECEBIDO", amountCents: 250000, externalId: "a1b2c4" },
      { line: 3, date: "2026-10-06", description: "Estorno", amountCents: 1000, externalId: "a1b2c4#2" },
    ]);
  });
  it("lê OFX 2.x (XML)", () => {
    const xml = `<?xml version="1.0"?><OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261010</DTPOSTED><TRNAMT>-15,50</TRNAMT><FITID>X9</FITID><MEMO>Padaria</MEMO></STMTTRN></BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
    expect(parseOfx(xml).rows).toEqual([{ line: 1, date: "2026-10-10", description: "Padaria", amountCents: -1550, externalId: "X9" }]);
  });
  it("rejeita o que não é OFX", () => {
    expect(parseOfx("data;valor").errors[0]!.message).toMatch(/não parece ser OFX/);
    expect(detectFormat("extrato.ofx", "")).toBe("OFX");
    expect(detectFormat("extrato.csv", "Data;Valor")).toBe("CSV");
  });
});

describe("CSV", () => {
  it("divide respeitando aspas", () => {
    expect(splitCsvLine('05/10/2026;"Loja; centro";"-10,00"', ";")).toEqual(["05/10/2026", "Loja; centro", "-10,00"]);
    expect(splitCsvLine('a,"b ""c""",d', ",")).toEqual(["a", 'b "c"', "d"]);
  });

  it("detecta colunas pelo cabeçalho, ignora linhas de saldo e gera ids estáveis", () => {
    const csv = "﻿Data;Histórico;Valor;Saldo\n03/10/2026;Mercado;-89,90;1.000,00\n03/10/2026;Mercado;-89,90;910,10\n04/10/2026;Saldo do dia;0;910,10\n05/10/2026;PIX recebido;2.500,00;3.410,10\n";
    const g = guessCsvMapping(csv);
    expect(g.mapping).toMatchObject({ date: 0, description: 1, amount: 2, header: true, delimiter: ";" });
    const r = parseCsv(csv, g.mapping!);
    expect(r.errors).toEqual([]);
    expect(r.rows.map((x) => [x.date, x.description, x.amountCents])).toEqual([
      ["2026-10-03", "Mercado", -8990],
      ["2026-10-03", "Mercado", -8990],
      ["2026-10-05", "PIX recebido", 250000],
    ]);
    // Duas compras iguais no mesmo dia continuam sendo duas (ids diferentes) e o id é estável
    expect(r.rows[0]!.externalId).not.toBe(r.rows[1]!.externalId);
    expect(parseCsv(csv, g.mapping!).rows.map((x) => x.externalId)).toEqual(r.rows.map((x) => x.externalId));
  });

  it("débito e crédito em colunas separadas; inverter sinal", () => {
    const csv = "data,descricao,debito,credito\n2026-10-01,Aluguel,1500.00,\n2026-10-02,Salário,,5000.00\n";
    const g = guessCsvMapping(csv);
    expect(g.mapping).toMatchObject({ debit: 2, credit: 3, amount: null });
    expect(parseCsv(csv, g.mapping!).rows.map((x) => x.amountCents)).toEqual([-150000, 500000]);
    expect(parseCsv(csv, { ...g.mapping!, invert: true }).rows.map((x) => x.amountCents)).toEqual([150000, -500000]);
  });

  it("aponta linhas com data inválida", () => {
    const r = parseCsv("Data;Descrição;Valor\n32/13/2026;X;10,00\n", { date: 0, description: 1, amount: 2, header: true, delimiter: ";" });
    expect(r.errors).toEqual([{ line: 2, message: "Data inválida: “32/13/2026”." }]);
    expect(guessCsvMapping("a;b;c\n1;2;3").mapping).toBeNull();
  });
});
