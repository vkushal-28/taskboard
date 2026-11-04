import { CHECKLIST_MAX_ITEMS, cardDtoSchema } from '@taskboard/shared';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  accessCookieFor,
  createBoardWithRoles,
  createCard,
  createList,
  errorOf,
  parseBody,
} from '../../../test/factories.js';
import { createApp } from '../../app.js';
import { ActivityModel } from '../activity/model.js';
import { CardModel } from './model.js';

const cardBodySchema = z.object({ card: cardDtoSchema });
const MISSING_ID = '64b000000000000000000000';

let app: ReturnType<typeof createApp>;
beforeEach(() => {
  app = createApp();
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** A card with items "Draft", "Review", "Publish", acted on by a member. */
async function cardWithChecklist() {
  const { board, member } = await createBoardWithRoles();
  const list = await createList(board._id);
  const card = await createCard(list, {
    checklist: [{ text: 'Draft' }, { text: 'Review' }, { text: 'Publish' }],
  });
  const [draft, review, publish] = card.checklist.map((item) => item._id.toString());
  if (!draft || !review || !publish) throw new Error('expected three items');
  const cookie = await accessCookieFor(member);
  const as = {
    post: (path: string) => request(app).post(path).set('Cookie', cookie),
    patch: (path: string) => request(app).patch(path).set('Cookie', cookie),
    delete: (path: string) => request(app).delete(path).set('Cookie', cookie),
  };
  return { card, items: { draft, review, publish }, as, base: `/cards/${card.id}/checklist` };
}

const stored = async (cardId: string) =>
  (await CardModel.findById(cardId).lean())?.checklist.map(({ text, done }) => ({ text, done }));

describe('POST /cards/:cardId/checklist', () => {
  it('adds an unticked item at the end and logs it', async () => {
    const { card, as, base } = await cardWithChecklist();

    const res = await as.post(base).send({ text: '  Ship it  ' }).expect(201);

    const { card: dto } = parseBody(cardBodySchema, res);
    expect(dto.checklist.map((item) => item.text)).toEqual([
      'Draft',
      'Review',
      'Publish',
      'Ship it',
    ]);
    expect(dto.checklist.at(-1)?.done).toBe(false);
    expect(await ActivityModel.findOne({ cardId: card._id }).lean()).toMatchObject({
      type: 'card.updated',
      meta: { fields: ['checklist'] },
    });
  });

  it(`refuses an item past ${CHECKLIST_MAX_ITEMS}`, async () => {
    const { board, member } = await createBoardWithRoles();
    const list = await createList(board._id);
    const full = await createCard(list, {
      checklist: Array.from({ length: CHECKLIST_MAX_ITEMS }, (_, i) => ({ text: `Step ${i}` })),
    });

    const res = await request(app)
      .post(`/cards/${full.id}/checklist`)
      .set('Cookie', await accessCookieFor(member))
      .send({ text: 'One too many' })
      .expect(400);

    expect(errorOf(res).code).toBe('VALIDATION_ERROR');
    expect(await stored(full.id)).toHaveLength(CHECKLIST_MAX_ITEMS);
  });

  it('rejects empty text', async () => {
    const { as, base } = await cardWithChecklist();
    await as.post(base).send({ text: '   ' }).expect(400);
  });
});

describe('PATCH /cards/:cardId/checklist/:itemId', () => {
  it('changes only the item it names', async () => {
    const { card, items, as, base } = await cardWithChecklist();

    await as.patch(`${base}/${items.review}`).send({ done: true }).expect(200);
    await as.patch(`${base}/${items.draft}`).send({ text: 'First draft' }).expect(200);

    expect(await stored(card.id)).toEqual([
      { text: 'First draft', done: false },
      { text: 'Review', done: true },
      { text: 'Publish', done: false },
    ]);
  });

  it('keeps both ticks when two people tick different items at the same moment', async () => {
    const { card, items, as, base } = await cardWithChecklist();

    await Promise.all([
      as.patch(`${base}/${items.draft}`).send({ done: true }).expect(200),
      as.patch(`${base}/${items.publish}`).send({ done: true }).expect(200),
    ]);

    expect((await stored(card.id))?.map((item) => item.done)).toEqual([true, false, true]);
  });

  it('answers 404 for a missing item, a malformed item id and a missing card', async () => {
    const { card, as, base } = await cardWithChecklist();

    const missingItem = await as.patch(`${base}/${MISSING_ID}`).send({ done: true }).expect(404);
    expect(errorOf(missingItem).message).toBe('Checklist item not found');
    await as.patch(`${base}/not-an-id`).send({ done: true }).expect(404);
    // An unknown card fails the board lookup first, like every other card route.
    await as.patch(`/cards/${MISSING_ID}/checklist/${MISSING_ID}`).send({ done: true }).expect(404);
    expect(await ActivityModel.countDocuments({ cardId: card._id })).toBe(0);
  });

  it('needs text or done', async () => {
    const { items, as, base } = await cardWithChecklist();
    await as.patch(`${base}/${items.draft}`).send({}).expect(400);
  });
});

describe('DELETE /cards/:cardId/checklist/:itemId', () => {
  it('removes the item and returns the card', async () => {
    const { card, items, as, base } = await cardWithChecklist();

    const res = await as.delete(`${base}/${items.review}`).expect(200);

    expect(parseBody(cardBodySchema, res).card.checklist.map((item) => item.text)).toEqual([
      'Draft',
      'Publish',
    ]);
    expect(await stored(card.id)).toHaveLength(2);
  });

  it('answers 404 when the item is already gone', async () => {
    const { items, as, base } = await cardWithChecklist();
    await as.delete(`${base}/${items.review}`).expect(200);
    await as.delete(`${base}/${items.review}`).expect(404);
  });
});

describe('card versions (ADR 013)', () => {
  it('goes up by one with every kind of card write', async () => {
    const { board, member } = await createBoardWithRoles();
    const todo = await createList(board._id);
    const done = await createList(board._id);
    const cookie = await accessCookieFor(member);
    const call = (method: 'post' | 'patch' | 'delete', path: string, body?: object) =>
      request(app)[method](path).set('Cookie', cookie).send(body);
    const versionOf = (res: request.Response) => parseBody(cardBodySchema, res).card.version;

    const created = await call('post', `/lists/${todo.id}/cards`, { title: 'Brief' }).expect(201);
    const cardId = parseBody(cardBodySchema, created).card.id;
    expect(versionOf(created)).toBe(0);

    const versions = [
      versionOf(await call('patch', `/cards/${cardId}`, { title: 'Brief v2' }).expect(200)),
      versionOf(await call('patch', `/cards/${cardId}/move`, { listId: done.id }).expect(200)),
      versionOf(await call('post', `/cards/${cardId}/checklist`, { text: 'Step' }).expect(201)),
    ];
    const itemId = (await CardModel.findById(cardId).lean())?.checklist[0]?._id.toString();
    versions.push(
      versionOf(
        await call('patch', `/cards/${cardId}/checklist/${itemId}`, { done: true }).expect(200),
      ),
      versionOf(await call('delete', `/cards/${cardId}/checklist/${itemId}`).expect(200)),
    );

    expect(versions).toEqual([1, 2, 3, 4, 5]);
  });

  it("returns the card as stored after the update, including someone else's change", async () => {
    const { card, as } = await cardWithChecklist();
    // Another write lands between updateCard's first query and its update. Only that query
    // asks for `{ archived: 1 }`; the role middleware's findById also goes through findOne.
    const findOne = CardModel.findOne.bind(CardModel);
    let injected = false;
    vi.spyOn(CardModel, 'findOne').mockImplementation((...args: Parameters<typeof findOne>) => {
      const query = findOne(...args);
      const projection: unknown = args[1];
      if (injected || JSON.stringify(projection) !== JSON.stringify({ archived: 1 })) return query;
      injected = true;
      const exec = query.exec.bind(query);
      query.exec = async () => {
        const result = await exec();
        await CardModel.updateOne({ _id: card._id }, { $set: { description: 'From Alex' } });
        return result;
      };
      return query;
    });

    const res = await as.patch(`/cards/${card.id}`).send({ title: 'From Priya' }).expect(200);

    expect(injected).toBe(true);
    expect(parseBody(cardBodySchema, res).card).toMatchObject({
      title: 'From Priya',
      description: 'From Alex',
    });
  });
});
