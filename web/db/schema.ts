import {sqliteTable,text,integer,primaryKey,index} from 'drizzle-orm/sqlite-core';
export const rooms=sqliteTable('rooms',{
 code:text('code').primaryKey(),hostKey:text('host_key').notNull(),guestKey:text('guest_key'),status:text('status').notNull().default('waiting'),
 createdAt:integer('created_at').notNull(),lastHost:integer('last_host').notNull(),lastGuest:integer('last_guest'),expiresAt:integer('expires_at').notNull(),
 state:text('state'),stateSeq:integer('state_seq').notNull().default(0),ackedSeq:integer('acked_seq').notNull().default(0),guestSeq:integer('guest_seq').notNull().default(0)
},t=>[index('idx_rooms_expiry').on(t.expiresAt)]);
export const commands=sqliteTable('commands',{
 roomCode:text('room_code').notNull().references(()=>rooms.code,{onDelete:'cascade'}),seq:integer('seq').notNull(),payload:text('payload').notNull()
},t=>[primaryKey({columns:[t.roomCode,t.seq]})]);
