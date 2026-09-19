import { describe, expect, it } from 'vitest'
import { postAnalysisBatchSchema, postAnalysisSchema } from '../src/call-a/schema'
import { communityPlanSchema } from '../src/call-b/schema'
import { toStrictSchema } from '../src/provider/openai'
import type { JsonSchema } from '../src/provider/types'

/**
 * The schema files are written in the OpenAPI subset Gemini accepts, and the
 * OpenAI adapter translates them on the way out. If that translation is wrong,
 * every call fails at the API with a schema error and no post gets analysed -
 * so it is worth the twenty lines of test rather than finding out at the venue.
 */

/** Walk every object node in a schema, including through arrays. */
const objects = (schema: JsonSchema, found: JsonSchema[] = []): JsonSchema[] => {
  const type = schema.type
  const isObject = type === 'object' || (Array.isArray(type) && type.includes('object'))
  if (isObject) found.push(schema)
  for (const value of Object.values(schema.properties ?? {})) {
    objects(value as JsonSchema, found)
  }
  if (schema.items) objects(schema.items as JsonSchema, found)
  return found
}

/** Typed property lookup; the schemas are hand-built, so a miss is a test bug. */
const prop = (schema: JsonSchema, key: string): JsonSchema =>
  (schema.properties as Record<string, JsonSchema>)[key] as JsonSchema

const keywords = (schema: JsonSchema, found: string[] = []): string[] => {
  for (const key of Object.keys(schema)) found.push(key)
  for (const value of Object.values(schema.properties ?? {})) keywords(value as JsonSchema, found)
  if (schema.items) keywords(schema.items as JsonSchema, found)
  return found
}

describe('toStrictSchema', () => {
  it('turns nullable into a type union, at every depth', () => {
    const strict = toStrictSchema(postAnalysisSchema)

    expect(prop(strict, 'valence').type).toEqual(['number', 'null'])
    expect(prop(strict, 'valence').nullable).toBeUndefined()
    expect(prop(prop(strict, 'dimensions'), 'energy').type).toEqual(['number', 'null'])
    expect(prop(prop(strict, 'incident'), 'location_hint').type).toEqual(['string', 'null'])
  })

  it('keeps a nullable object nullable and still strict', () => {
    const strict = toStrictSchema(communityPlanSchema)
    const hero = prop(strict, 'hero_asset')

    expect(hero.type).toEqual(['object', 'null'])
    expect(hero.additionalProperties).toBe(false)
    expect(hero.required).toEqual(['tag', 'prominence'])
  })

  it('marks every object closed and every property required', () => {
    for (const schema of [postAnalysisSchema, communityPlanSchema]) {
      for (const node of objects(toStrictSchema(schema))) {
        expect(node.additionalProperties).toBe(false)
        expect(node.required).toEqual(Object.keys(node.properties as object))
      }
    }
  })

  it('drops propertyOrdering, which strict mode rejects as unknown', () => {
    for (const schema of [postAnalysisSchema, communityPlanSchema]) {
      expect(keywords(toStrictSchema(schema))).not.toContain('propertyOrdering')
      expect(keywords(toStrictSchema(schema))).not.toContain('nullable')
    }
  })

  it('leaves enums and the contracts tuples untouched', () => {
    const strict = toStrictSchema(communityPlanSchema)
    expect(prop(strict, 'archetype').enum).toEqual(prop(communityPlanSchema, 'archetype').enum)
  })

  it('does not mutate the source schema', () => {
    const before = JSON.stringify(postAnalysisBatchSchema)
    toStrictSchema(postAnalysisBatchSchema)
    expect(JSON.stringify(postAnalysisBatchSchema)).toBe(before)
  })
})
