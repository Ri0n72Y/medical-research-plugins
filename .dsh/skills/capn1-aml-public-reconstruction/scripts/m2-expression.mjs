import { createReadStream, createWriteStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { once } from 'node:events'
import { finished } from 'node:stream/promises'
import { join } from 'node:path'

const required = ['gene_id', 'gene_name', 'gene_type', 'unstranded', 'tpm_unstranded']
const ensemblGene = /^ENSG\d+(?:\.\d+)?(?:_PAR_Y)?$/

async function readGeneFile(path, onGene) {
  const input = createReadStream(path)
  const reader = createInterface({ input, crlfDelay: Infinity })
  let columns
  let rows = 0
  try {
    for await (const line of reader) {
      if (!line || line.startsWith('#')) continue
      const fields = line.split('\t')
      if (!columns) {
        columns = Object.fromEntries(fields.map((name, index) => [name, index]))
        for (const name of required) if (columns[name] === undefined) throw new Error(`Missing GDC STAR column ${name}: ${path}`)
        continue
      }
      const id = fields[columns.gene_id]
      if (id?.startsWith('N_') || id?.startsWith('__')) continue
      if (!ensemblGene.test(id ?? '')) throw new Error(`Unexpected gene ID at row ${rows + 1}: ${id}`)
      const count = Number(fields[columns.unstranded])
      const tpm = Number(fields[columns.tpm_unstranded])
      if (!Number.isSafeInteger(count) || count < 0 || !Number.isFinite(tpm) || tpm < 0 || fields[columns.tpm_unstranded] === '' || fields[columns.unstranded] === '') {
        throw new Error(`Invalid counts/TPM for ${id}: ${path}`)
      }
      await onGene({ id, name: fields[columns.gene_name], type: fields[columns.gene_type], count, tpm }, rows++)
    }
  } finally {
    reader.close()
    input.destroy()
  }
  if (!columns || rows === 0) throw new Error(`Empty or malformed GDC STAR expression file: ${path}`)
  return rows
}

async function writeTsv(path, header, rows) {
  const stream = createWriteStream(path, { flags: 'wx' })
  try {
    for (const line of (function* () { yield header; yield* rows })()) {
      if (!stream.write(`${line}\n`)) await once(stream, 'drain')
    }
    stream.end()
    await finished(stream)
  } catch (error) {
    stream.destroy()
    throw error
  }
}

export async function buildExpressionMatrices(workspace, files, outDir) {
  const genes = []
  const counts = []
  const tpms = []
  for (const [column, file] of files.entries()) {
    const values = []
    const normalized = []
    const seen = new Set()
    const count = await readGeneFile(join(workspace, file.path), (gene, index) => {
      if (seen.has(gene.id)) throw new Error(`Duplicate gene ID ${gene.id}: ${file.file_id}`)
      seen.add(gene.id)
      if (column === 0) genes.push({ id: gene.id, name: gene.name, type: gene.type })
      else if (genes[index]?.id !== gene.id || genes[index]?.name !== gene.name || genes[index]?.type !== gene.type) {
        throw new Error(`Gene order or annotation mismatch at ${gene.id}: ${file.file_id}`)
      }
      values.push(gene.count)
      normalized.push(gene.tpm)
    })
    if (column > 0 && count !== genes.length) throw new Error(`Gene count mismatch: ${file.file_id}`)
    counts.push(Float64Array.from(values))
    tpms.push(Float64Array.from(normalized))
  }
  const ids = files.map(file => file.file_id)
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate GDC file ID in source manifest')
  const tableRows = (arrays) => (function* () {
    for (let i = 0; i < genes.length; i += 1) yield [genes[i].id, ...arrays.map(a => String(a[i]))].join('\t')
  })()
  await writeTsv(join(outDir, 'counts-unstranded.tsv'), ['gene_id', ...ids].join('\t'), tableRows(counts))
  await writeTsv(join(outDir, 'tpm-unstranded.tsv'), ['gene_id', ...ids].join('\t'), tableRows(tpms))
  await writeTsv(join(outDir, 'gene-annotation.tsv'), 'gene_id\tgene_name\tgene_type', genes.map(g => [g.id, g.name, g.type].join('\t')))
  const capn1 = genes.map((g, i) => ({ ...g, index: i })).filter(g => g.name === 'CAPN1')
  if (capn1.length === 1) {
    const i = capn1[0].index
    await writeTsv(join(outDir, 'capn1-expression.tsv'), 'file_id\tcase_ids\tgene_id\tunstranded\ttpm_unstranded',
      files.map((file, column) => [file.file_id, file.cases.map(c => c.case_id).join(';'), capn1[0].id, counts[column][i], tpms[column][i]].join('\t')))
  }
  return { genes: genes.length, files: files.length, capn1_gene_ids: capn1.map(g => g.id), capn1_resolved: capn1.length === 1 }
}
