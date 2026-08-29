
/**
 * Client
**/

import * as runtime from './runtime/library.js';
import $Types = runtime.Types // general types
import $Public = runtime.Types.Public
import $Utils = runtime.Types.Utils
import $Extensions = runtime.Types.Extensions
import $Result = runtime.Types.Result

export type PrismaPromise<T> = $Public.PrismaPromise<T>


/**
 * Model ComputedUpdateOutbox
 * 
 */
export type ComputedUpdateOutbox = $Result.DefaultSelection<Prisma.$ComputedUpdateOutboxPayload>
/**
 * Model ComputedUpdateOutboxSeed
 * 
 */
export type ComputedUpdateOutboxSeed = $Result.DefaultSelection<Prisma.$ComputedUpdateOutboxSeedPayload>
/**
 * Model ComputedUpdateDeadLetter
 * 
 */
export type ComputedUpdateDeadLetter = $Result.DefaultSelection<Prisma.$ComputedUpdateDeadLetterPayload>
/**
 * Model ComputedUpdatePauseScope
 * 
 */
export type ComputedUpdatePauseScope = $Result.DefaultSelection<Prisma.$ComputedUpdatePauseScopePayload>
/**
 * Model ComputedFieldActivity
 * Projection of async computed activity per field (co-located with outbox on data plane).
 */
export type ComputedFieldActivity = $Result.DefaultSelection<Prisma.$ComputedFieldActivityPayload>
/**
 * Model ComputedTableActivity
 * Projection of async computed activity per table.
 */
export type ComputedTableActivity = $Result.DefaultSelection<Prisma.$ComputedTableActivityPayload>
/**
 * Model ComputedTaskFieldRef
 * Task→field refset for activity refcounting (prevents merge double-count).
 */
export type ComputedTaskFieldRef = $Result.DefaultSelection<Prisma.$ComputedTaskFieldRefPayload>
/**
 * Model RecordHistory
 * 
 */
export type RecordHistory = $Result.DefaultSelection<Prisma.$RecordHistoryPayload>
/**
 * Model TableTrash
 * 
 */
export type TableTrash = $Result.DefaultSelection<Prisma.$TableTrashPayload>
/**
 * Model RecordTrash
 * 
 */
export type RecordTrash = $Result.DefaultSelection<Prisma.$RecordTrashPayload>
/**
 * Model Attachments
 * 
 */
export type Attachments = $Result.DefaultSelection<Prisma.$AttachmentsPayload>
/**
 * Model AttachmentsTable
 * 
 */
export type AttachmentsTable = $Result.DefaultSelection<Prisma.$AttachmentsTablePayload>

/**
 * ##  Prisma Client ʲˢ
 *
 * Type-safe database client for TypeScript & Node.js
 * @example
 * ```
 * const prisma = new PrismaClient()
 * // Fetch zero or more ComputedUpdateOutboxes
 * const computedUpdateOutboxes = await prisma.computedUpdateOutbox.findMany()
 * ```
 *
 *
 * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
 */
export class PrismaClient<
  ClientOptions extends Prisma.PrismaClientOptions = Prisma.PrismaClientOptions,
  U = 'log' extends keyof ClientOptions ? ClientOptions['log'] extends Array<Prisma.LogLevel | Prisma.LogDefinition> ? Prisma.GetEvents<ClientOptions['log']> : never : never,
  ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs
> {
  [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['other'] }

    /**
   * ##  Prisma Client ʲˢ
   *
   * Type-safe database client for TypeScript & Node.js
   * @example
   * ```
   * const prisma = new PrismaClient()
   * // Fetch zero or more ComputedUpdateOutboxes
   * const computedUpdateOutboxes = await prisma.computedUpdateOutbox.findMany()
   * ```
   *
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
   */

  constructor(optionsArg ?: Prisma.Subset<ClientOptions, Prisma.PrismaClientOptions>);
  $on<V extends U>(eventType: V, callback: (event: V extends 'query' ? Prisma.QueryEvent : Prisma.LogEvent) => void): void;

  /**
   * Connect with the database
   */
  $connect(): $Utils.JsPromise<void>;

  /**
   * Disconnect from the database
   */
  $disconnect(): $Utils.JsPromise<void>;

  /**
   * Add a middleware
   * @deprecated since 4.16.0. For new code, prefer client extensions instead.
   * @see https://pris.ly/d/extensions
   */
  $use(cb: Prisma.Middleware): void

/**
   * Executes a prepared raw query and returns the number of affected rows.
   * @example
   * ```
   * const result = await prisma.$executeRaw`UPDATE User SET cool = ${true} WHERE email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Executes a raw query and returns the number of affected rows.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$executeRawUnsafe('UPDATE User SET cool = $1 WHERE email = $2 ;', true, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Performs a prepared raw query and returns the `SELECT` data.
   * @example
   * ```
   * const result = await prisma.$queryRaw`SELECT * FROM User WHERE id = ${1} OR email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<T>;

  /**
   * Performs a raw query and returns the `SELECT` data.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$queryRawUnsafe('SELECT * FROM User WHERE id = $1 OR email = $2;', 1, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<T>;


  /**
   * Allows the running of a sequence of read/write operations that are guaranteed to either succeed or fail as a whole.
   * @example
   * ```
   * const [george, bob, alice] = await prisma.$transaction([
   *   prisma.user.create({ data: { name: 'George' } }),
   *   prisma.user.create({ data: { name: 'Bob' } }),
   *   prisma.user.create({ data: { name: 'Alice' } }),
   * ])
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/concepts/components/prisma-client/transactions).
   */
  $transaction<P extends Prisma.PrismaPromise<any>[]>(arg: [...P], options?: { isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<runtime.Types.Utils.UnwrapTuple<P>>

  $transaction<R>(fn: (prisma: Omit<PrismaClient, runtime.ITXClientDenyList>) => $Utils.JsPromise<R>, options?: { maxWait?: number, timeout?: number, isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<R>


  $extends: $Extensions.ExtendsHook<"extends", Prisma.TypeMapCb, ExtArgs, $Utils.Call<Prisma.TypeMapCb, {
    extArgs: ExtArgs
  }>, ClientOptions>

      /**
   * `prisma.computedUpdateOutbox`: Exposes CRUD operations for the **ComputedUpdateOutbox** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more ComputedUpdateOutboxes
    * const computedUpdateOutboxes = await prisma.computedUpdateOutbox.findMany()
    * ```
    */
  get computedUpdateOutbox(): Prisma.ComputedUpdateOutboxDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.computedUpdateOutboxSeed`: Exposes CRUD operations for the **ComputedUpdateOutboxSeed** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more ComputedUpdateOutboxSeeds
    * const computedUpdateOutboxSeeds = await prisma.computedUpdateOutboxSeed.findMany()
    * ```
    */
  get computedUpdateOutboxSeed(): Prisma.ComputedUpdateOutboxSeedDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.computedUpdateDeadLetter`: Exposes CRUD operations for the **ComputedUpdateDeadLetter** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more ComputedUpdateDeadLetters
    * const computedUpdateDeadLetters = await prisma.computedUpdateDeadLetter.findMany()
    * ```
    */
  get computedUpdateDeadLetter(): Prisma.ComputedUpdateDeadLetterDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.computedUpdatePauseScope`: Exposes CRUD operations for the **ComputedUpdatePauseScope** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more ComputedUpdatePauseScopes
    * const computedUpdatePauseScopes = await prisma.computedUpdatePauseScope.findMany()
    * ```
    */
  get computedUpdatePauseScope(): Prisma.ComputedUpdatePauseScopeDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.computedFieldActivity`: Exposes CRUD operations for the **ComputedFieldActivity** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more ComputedFieldActivities
    * const computedFieldActivities = await prisma.computedFieldActivity.findMany()
    * ```
    */
  get computedFieldActivity(): Prisma.ComputedFieldActivityDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.computedTableActivity`: Exposes CRUD operations for the **ComputedTableActivity** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more ComputedTableActivities
    * const computedTableActivities = await prisma.computedTableActivity.findMany()
    * ```
    */
  get computedTableActivity(): Prisma.ComputedTableActivityDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.computedTaskFieldRef`: Exposes CRUD operations for the **ComputedTaskFieldRef** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more ComputedTaskFieldRefs
    * const computedTaskFieldRefs = await prisma.computedTaskFieldRef.findMany()
    * ```
    */
  get computedTaskFieldRef(): Prisma.ComputedTaskFieldRefDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.recordHistory`: Exposes CRUD operations for the **RecordHistory** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more RecordHistories
    * const recordHistories = await prisma.recordHistory.findMany()
    * ```
    */
  get recordHistory(): Prisma.RecordHistoryDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.tableTrash`: Exposes CRUD operations for the **TableTrash** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more TableTrashes
    * const tableTrashes = await prisma.tableTrash.findMany()
    * ```
    */
  get tableTrash(): Prisma.TableTrashDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.recordTrash`: Exposes CRUD operations for the **RecordTrash** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more RecordTrashes
    * const recordTrashes = await prisma.recordTrash.findMany()
    * ```
    */
  get recordTrash(): Prisma.RecordTrashDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.attachments`: Exposes CRUD operations for the **Attachments** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Attachments
    * const attachments = await prisma.attachments.findMany()
    * ```
    */
  get attachments(): Prisma.AttachmentsDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.attachmentsTable`: Exposes CRUD operations for the **AttachmentsTable** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more AttachmentsTables
    * const attachmentsTables = await prisma.attachmentsTable.findMany()
    * ```
    */
  get attachmentsTable(): Prisma.AttachmentsTableDelegate<ExtArgs, ClientOptions>;
}

export namespace Prisma {
  export import DMMF = runtime.DMMF

  export type PrismaPromise<T> = $Public.PrismaPromise<T>

  /**
   * Validator
   */
  export import validator = runtime.Public.validator

  /**
   * Prisma Errors
   */
  export import PrismaClientKnownRequestError = runtime.PrismaClientKnownRequestError
  export import PrismaClientUnknownRequestError = runtime.PrismaClientUnknownRequestError
  export import PrismaClientRustPanicError = runtime.PrismaClientRustPanicError
  export import PrismaClientInitializationError = runtime.PrismaClientInitializationError
  export import PrismaClientValidationError = runtime.PrismaClientValidationError

  /**
   * Re-export of sql-template-tag
   */
  export import sql = runtime.sqltag
  export import empty = runtime.empty
  export import join = runtime.join
  export import raw = runtime.raw
  export import Sql = runtime.Sql



  /**
   * Decimal.js
   */
  export import Decimal = runtime.Decimal

  export type DecimalJsLike = runtime.DecimalJsLike

  /**
   * Metrics 
   */
  export type Metrics = runtime.Metrics
  export type Metric<T> = runtime.Metric<T>
  export type MetricHistogram = runtime.MetricHistogram
  export type MetricHistogramBucket = runtime.MetricHistogramBucket

  /**
  * Extensions
  */
  export import Extension = $Extensions.UserArgs
  export import getExtensionContext = runtime.Extensions.getExtensionContext
  export import Args = $Public.Args
  export import Payload = $Public.Payload
  export import Result = $Public.Result
  export import Exact = $Public.Exact

  /**
   * Prisma Client JS version: 6.2.1
   * Query Engine version: 4123509d24aa4dede1e864b46351bf2790323b69
   */
  export type PrismaVersion = {
    client: string
  }

  export const prismaVersion: PrismaVersion 

  /**
   * Utility Types
   */


  export import JsonObject = runtime.JsonObject
  export import JsonArray = runtime.JsonArray
  export import JsonValue = runtime.JsonValue
  export import InputJsonObject = runtime.InputJsonObject
  export import InputJsonArray = runtime.InputJsonArray
  export import InputJsonValue = runtime.InputJsonValue

  /**
   * Types of the values used to represent different kinds of `null` values when working with JSON fields.
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  namespace NullTypes {
    /**
    * Type of `Prisma.DbNull`.
    * 
    * You cannot use other instances of this class. Please use the `Prisma.DbNull` value.
    * 
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class DbNull {
      private DbNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.JsonNull`.
    * 
    * You cannot use other instances of this class. Please use the `Prisma.JsonNull` value.
    * 
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class JsonNull {
      private JsonNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.AnyNull`.
    * 
    * You cannot use other instances of this class. Please use the `Prisma.AnyNull` value.
    * 
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class AnyNull {
      private AnyNull: never
      private constructor()
    }
  }

  /**
   * Helper for filtering JSON entries that have `null` on the database (empty on the db)
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const DbNull: NullTypes.DbNull

  /**
   * Helper for filtering JSON entries that have JSON `null` values (not empty on the db)
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const JsonNull: NullTypes.JsonNull

  /**
   * Helper for filtering JSON entries that are `Prisma.DbNull` or `Prisma.JsonNull`
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const AnyNull: NullTypes.AnyNull

  type SelectAndInclude = {
    select: any
    include: any
  }

  type SelectAndOmit = {
    select: any
    omit: any
  }

  /**
   * Get the type of the value, that the Promise holds.
   */
  export type PromiseType<T extends PromiseLike<any>> = T extends PromiseLike<infer U> ? U : T;

  /**
   * Get the return type of a function which returns a Promise.
   */
  export type PromiseReturnType<T extends (...args: any) => $Utils.JsPromise<any>> = PromiseType<ReturnType<T>>

  /**
   * From T, pick a set of properties whose keys are in the union K
   */
  type Prisma__Pick<T, K extends keyof T> = {
      [P in K]: T[P];
  };


  export type Enumerable<T> = T | Array<T>;

  export type RequiredKeys<T> = {
    [K in keyof T]-?: {} extends Prisma__Pick<T, K> ? never : K
  }[keyof T]

  export type TruthyKeys<T> = keyof {
    [K in keyof T as T[K] extends false | undefined | null ? never : K]: K
  }

  export type TrueKeys<T> = TruthyKeys<Prisma__Pick<T, RequiredKeys<T>>>

  /**
   * Subset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection
   */
  export type Subset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never;
  };

  /**
   * SelectSubset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection.
   * Additionally, it validates, if both select and include are present. If the case, it errors.
   */
  export type SelectSubset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    (T extends SelectAndInclude
      ? 'Please either choose `select` or `include`.'
      : T extends SelectAndOmit
        ? 'Please either choose `select` or `omit`.'
        : {})

  /**
   * Subset + Intersection
   * @desc From `T` pick properties that exist in `U` and intersect `K`
   */
  export type SubsetIntersection<T, U, K> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    K

  type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

  /**
   * XOR is needed to have a real mutually exclusive union type
   * https://stackoverflow.com/questions/42123407/does-typescript-support-mutually-exclusive-types
   */
  type XOR<T, U> =
    T extends object ?
    U extends object ?
      (Without<T, U> & U) | (Without<U, T> & T)
    : U : T


  /**
   * Is T a Record?
   */
  type IsObject<T extends any> = T extends Array<any>
  ? False
  : T extends Date
  ? False
  : T extends Uint8Array
  ? False
  : T extends BigInt
  ? False
  : T extends object
  ? True
  : False


  /**
   * If it's T[], return T
   */
  export type UnEnumerate<T extends unknown> = T extends Array<infer U> ? U : T

  /**
   * From ts-toolbelt
   */

  type __Either<O extends object, K extends Key> = Omit<O, K> &
    {
      // Merge all but K
      [P in K]: Prisma__Pick<O, P & keyof O> // With K possibilities
    }[K]

  type EitherStrict<O extends object, K extends Key> = Strict<__Either<O, K>>

  type EitherLoose<O extends object, K extends Key> = ComputeRaw<__Either<O, K>>

  type _Either<
    O extends object,
    K extends Key,
    strict extends Boolean
  > = {
    1: EitherStrict<O, K>
    0: EitherLoose<O, K>
  }[strict]

  type Either<
    O extends object,
    K extends Key,
    strict extends Boolean = 1
  > = O extends unknown ? _Either<O, K, strict> : never

  export type Union = any

  type PatchUndefined<O extends object, O1 extends object> = {
    [K in keyof O]: O[K] extends undefined ? At<O1, K> : O[K]
  } & {}

  /** Helper Types for "Merge" **/
  export type IntersectOf<U extends Union> = (
    U extends unknown ? (k: U) => void : never
  ) extends (k: infer I) => void
    ? I
    : never

  export type Overwrite<O extends object, O1 extends object> = {
      [K in keyof O]: K extends keyof O1 ? O1[K] : O[K];
  } & {};

  type _Merge<U extends object> = IntersectOf<Overwrite<U, {
      [K in keyof U]-?: At<U, K>;
  }>>;

  type Key = string | number | symbol;
  type AtBasic<O extends object, K extends Key> = K extends keyof O ? O[K] : never;
  type AtStrict<O extends object, K extends Key> = O[K & keyof O];
  type AtLoose<O extends object, K extends Key> = O extends unknown ? AtStrict<O, K> : never;
  export type At<O extends object, K extends Key, strict extends Boolean = 1> = {
      1: AtStrict<O, K>;
      0: AtLoose<O, K>;
  }[strict];

  export type ComputeRaw<A extends any> = A extends Function ? A : {
    [K in keyof A]: A[K];
  } & {};

  export type OptionalFlat<O> = {
    [K in keyof O]?: O[K];
  } & {};

  type _Record<K extends keyof any, T> = {
    [P in K]: T;
  };

  // cause typescript not to expand types and preserve names
  type NoExpand<T> = T extends unknown ? T : never;

  // this type assumes the passed object is entirely optional
  type AtLeast<O extends object, K extends string> = NoExpand<
    O extends unknown
    ? | (K extends keyof O ? { [P in K]: O[P] } & O : O)
      | {[P in keyof O as P extends K ? K : never]-?: O[P]} & O
    : never>;

  type _Strict<U, _U = U> = U extends unknown ? U & OptionalFlat<_Record<Exclude<Keys<_U>, keyof U>, never>> : never;

  export type Strict<U extends object> = ComputeRaw<_Strict<U>>;
  /** End Helper Types for "Merge" **/

  export type Merge<U extends object> = ComputeRaw<_Merge<Strict<U>>>;

  /**
  A [[Boolean]]
  */
  export type Boolean = True | False

  // /**
  // 1
  // */
  export type True = 1

  /**
  0
  */
  export type False = 0

  export type Not<B extends Boolean> = {
    0: 1
    1: 0
  }[B]

  export type Extends<A1 extends any, A2 extends any> = [A1] extends [never]
    ? 0 // anything `never` is false
    : A1 extends A2
    ? 1
    : 0

  export type Has<U extends Union, U1 extends Union> = Not<
    Extends<Exclude<U1, U>, U1>
  >

  export type Or<B1 extends Boolean, B2 extends Boolean> = {
    0: {
      0: 0
      1: 1
    }
    1: {
      0: 1
      1: 1
    }
  }[B1][B2]

  export type Keys<U extends Union> = U extends unknown ? keyof U : never

  type Cast<A, B> = A extends B ? A : B;

  export const type: unique symbol;



  /**
   * Used by group by
   */

  export type GetScalarType<T, O> = O extends object ? {
    [P in keyof T]: P extends keyof O
      ? O[P]
      : never
  } : never

  type FieldPaths<
    T,
    U = Omit<T, '_avg' | '_sum' | '_count' | '_min' | '_max'>
  > = IsObject<T> extends True ? U : T

  type GetHavingFields<T> = {
    [K in keyof T]: Or<
      Or<Extends<'OR', K>, Extends<'AND', K>>,
      Extends<'NOT', K>
    > extends True
      ? // infer is only needed to not hit TS limit
        // based on the brilliant idea of Pierre-Antoine Mills
        // https://github.com/microsoft/TypeScript/issues/30188#issuecomment-478938437
        T[K] extends infer TK
        ? GetHavingFields<UnEnumerate<TK> extends object ? Merge<UnEnumerate<TK>> : never>
        : never
      : {} extends FieldPaths<T[K]>
      ? never
      : K
  }[keyof T]

  /**
   * Convert tuple to union
   */
  type _TupleToUnion<T> = T extends (infer E)[] ? E : never
  type TupleToUnion<K extends readonly any[]> = _TupleToUnion<K>
  type MaybeTupleToUnion<T> = T extends any[] ? TupleToUnion<T> : T

  /**
   * Like `Pick`, but additionally can also accept an array of keys
   */
  type PickEnumerable<T, K extends Enumerable<keyof T> | keyof T> = Prisma__Pick<T, MaybeTupleToUnion<K>>

  /**
   * Exclude all keys with underscores
   */
  type ExcludeUnderscoreKeys<T extends string> = T extends `_${string}` ? never : T


  export type FieldRef<Model, FieldType> = runtime.FieldRef<Model, FieldType>

  type FieldRefInputType<Model, FieldType> = Model extends never ? never : FieldRef<Model, FieldType>


  export const ModelName: {
    ComputedUpdateOutbox: 'ComputedUpdateOutbox',
    ComputedUpdateOutboxSeed: 'ComputedUpdateOutboxSeed',
    ComputedUpdateDeadLetter: 'ComputedUpdateDeadLetter',
    ComputedUpdatePauseScope: 'ComputedUpdatePauseScope',
    ComputedFieldActivity: 'ComputedFieldActivity',
    ComputedTableActivity: 'ComputedTableActivity',
    ComputedTaskFieldRef: 'ComputedTaskFieldRef',
    RecordHistory: 'RecordHistory',
    TableTrash: 'TableTrash',
    RecordTrash: 'RecordTrash',
    Attachments: 'Attachments',
    AttachmentsTable: 'AttachmentsTable'
  };

  export type ModelName = (typeof ModelName)[keyof typeof ModelName]


  export type Datasources = {
    db?: Datasource
  }

  interface TypeMapCb extends $Utils.Fn<{extArgs: $Extensions.InternalArgs, clientOptions: PrismaClientOptions }, $Utils.Record<string, any>> {
    returns: Prisma.TypeMap<this['params']['extArgs'], this['params']['clientOptions']>
  }

  export type TypeMap<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> = {
    meta: {
      modelProps: "computedUpdateOutbox" | "computedUpdateOutboxSeed" | "computedUpdateDeadLetter" | "computedUpdatePauseScope" | "computedFieldActivity" | "computedTableActivity" | "computedTaskFieldRef" | "recordHistory" | "tableTrash" | "recordTrash" | "attachments" | "attachmentsTable"
      txIsolationLevel: Prisma.TransactionIsolationLevel
    }
    model: {
      ComputedUpdateOutbox: {
        payload: Prisma.$ComputedUpdateOutboxPayload<ExtArgs>
        fields: Prisma.ComputedUpdateOutboxFieldRefs
        operations: {
          findUnique: {
            args: Prisma.ComputedUpdateOutboxFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedUpdateOutboxPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.ComputedUpdateOutboxFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedUpdateOutboxPayload>
          }
          findFirst: {
            args: Prisma.ComputedUpdateOutboxFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedUpdateOutboxPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.ComputedUpdateOutboxFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedUpdateOutboxPayload>
          }
          findMany: {
            args: Prisma.ComputedUpdateOutboxFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedUpdateOutboxPayload>[]
          }
          create: {
            args: Prisma.ComputedUpdateOutboxCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedUpdateOutboxPayload>
          }
          createMany: {
            args: Prisma.ComputedUpdateOutboxCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.ComputedUpdateOutboxCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedUpdateOutboxPayload>[]
          }
          delete: {
            args: Prisma.ComputedUpdateOutboxDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedUpdateOutboxPayload>
          }
          update: {
            args: Prisma.ComputedUpdateOutboxUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedUpdateOutboxPayload>
          }
          deleteMany: {
            args: Prisma.ComputedUpdateOutboxDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.ComputedUpdateOutboxUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.ComputedUpdateOutboxUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedUpdateOutboxPayload>[]
          }
          upsert: {
            args: Prisma.ComputedUpdateOutboxUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedUpdateOutboxPayload>
          }
          aggregate: {
            args: Prisma.ComputedUpdateOutboxAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateComputedUpdateOutbox>
          }
          groupBy: {
            args: Prisma.ComputedUpdateOutboxGroupByArgs<ExtArgs>
            result: $Utils.Optional<ComputedUpdateOutboxGroupByOutputType>[]
          }
          count: {
            args: Prisma.ComputedUpdateOutboxCountArgs<ExtArgs>
            result: $Utils.Optional<ComputedUpdateOutboxCountAggregateOutputType> | number
          }
        }
      }
      ComputedUpdateOutboxSeed: {
        payload: Prisma.$ComputedUpdateOutboxSeedPayload<ExtArgs>
        fields: Prisma.ComputedUpdateOutboxSeedFieldRefs
        operations: {
          findUnique: {
            args: Prisma.ComputedUpdateOutboxSeedFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedUpdateOutboxSeedPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.ComputedUpdateOutboxSeedFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedUpdateOutboxSeedPayload>
          }
          findFirst: {
            args: Prisma.ComputedUpdateOutboxSeedFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedUpdateOutboxSeedPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.ComputedUpdateOutboxSeedFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedUpdateOutboxSeedPayload>
          }
          findMany: {
            args: Prisma.ComputedUpdateOutboxSeedFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedUpdateOutboxSeedPayload>[]
          }
          create: {
            args: Prisma.ComputedUpdateOutboxSeedCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedUpdateOutboxSeedPayload>
          }
          createMany: {
            args: Prisma.ComputedUpdateOutboxSeedCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.ComputedUpdateOutboxSeedCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedUpdateOutboxSeedPayload>[]
          }
          delete: {
            args: Prisma.ComputedUpdateOutboxSeedDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedUpdateOutboxSeedPayload>
          }
          update: {
            args: Prisma.ComputedUpdateOutboxSeedUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedUpdateOutboxSeedPayload>
          }
          deleteMany: {
            args: Prisma.ComputedUpdateOutboxSeedDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.ComputedUpdateOutboxSeedUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.ComputedUpdateOutboxSeedUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedUpdateOutboxSeedPayload>[]
          }
          upsert: {
            args: Prisma.ComputedUpdateOutboxSeedUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedUpdateOutboxSeedPayload>
          }
          aggregate: {
            args: Prisma.ComputedUpdateOutboxSeedAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateComputedUpdateOutboxSeed>
          }
          groupBy: {
            args: Prisma.ComputedUpdateOutboxSeedGroupByArgs<ExtArgs>
            result: $Utils.Optional<ComputedUpdateOutboxSeedGroupByOutputType>[]
          }
          count: {
            args: Prisma.ComputedUpdateOutboxSeedCountArgs<ExtArgs>
            result: $Utils.Optional<ComputedUpdateOutboxSeedCountAggregateOutputType> | number
          }
        }
      }
      ComputedUpdateDeadLetter: {
        payload: Prisma.$ComputedUpdateDeadLetterPayload<ExtArgs>
        fields: Prisma.ComputedUpdateDeadLetterFieldRefs
        operations: {
          findUnique: {
            args: Prisma.ComputedUpdateDeadLetterFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedUpdateDeadLetterPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.ComputedUpdateDeadLetterFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedUpdateDeadLetterPayload>
          }
          findFirst: {
            args: Prisma.ComputedUpdateDeadLetterFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedUpdateDeadLetterPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.ComputedUpdateDeadLetterFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedUpdateDeadLetterPayload>
          }
          findMany: {
            args: Prisma.ComputedUpdateDeadLetterFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedUpdateDeadLetterPayload>[]
          }
          create: {
            args: Prisma.ComputedUpdateDeadLetterCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedUpdateDeadLetterPayload>
          }
          createMany: {
            args: Prisma.ComputedUpdateDeadLetterCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.ComputedUpdateDeadLetterCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedUpdateDeadLetterPayload>[]
          }
          delete: {
            args: Prisma.ComputedUpdateDeadLetterDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedUpdateDeadLetterPayload>
          }
          update: {
            args: Prisma.ComputedUpdateDeadLetterUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedUpdateDeadLetterPayload>
          }
          deleteMany: {
            args: Prisma.ComputedUpdateDeadLetterDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.ComputedUpdateDeadLetterUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.ComputedUpdateDeadLetterUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedUpdateDeadLetterPayload>[]
          }
          upsert: {
            args: Prisma.ComputedUpdateDeadLetterUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedUpdateDeadLetterPayload>
          }
          aggregate: {
            args: Prisma.ComputedUpdateDeadLetterAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateComputedUpdateDeadLetter>
          }
          groupBy: {
            args: Prisma.ComputedUpdateDeadLetterGroupByArgs<ExtArgs>
            result: $Utils.Optional<ComputedUpdateDeadLetterGroupByOutputType>[]
          }
          count: {
            args: Prisma.ComputedUpdateDeadLetterCountArgs<ExtArgs>
            result: $Utils.Optional<ComputedUpdateDeadLetterCountAggregateOutputType> | number
          }
        }
      }
      ComputedUpdatePauseScope: {
        payload: Prisma.$ComputedUpdatePauseScopePayload<ExtArgs>
        fields: Prisma.ComputedUpdatePauseScopeFieldRefs
        operations: {
          findUnique: {
            args: Prisma.ComputedUpdatePauseScopeFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedUpdatePauseScopePayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.ComputedUpdatePauseScopeFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedUpdatePauseScopePayload>
          }
          findFirst: {
            args: Prisma.ComputedUpdatePauseScopeFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedUpdatePauseScopePayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.ComputedUpdatePauseScopeFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedUpdatePauseScopePayload>
          }
          findMany: {
            args: Prisma.ComputedUpdatePauseScopeFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedUpdatePauseScopePayload>[]
          }
          create: {
            args: Prisma.ComputedUpdatePauseScopeCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedUpdatePauseScopePayload>
          }
          createMany: {
            args: Prisma.ComputedUpdatePauseScopeCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.ComputedUpdatePauseScopeCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedUpdatePauseScopePayload>[]
          }
          delete: {
            args: Prisma.ComputedUpdatePauseScopeDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedUpdatePauseScopePayload>
          }
          update: {
            args: Prisma.ComputedUpdatePauseScopeUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedUpdatePauseScopePayload>
          }
          deleteMany: {
            args: Prisma.ComputedUpdatePauseScopeDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.ComputedUpdatePauseScopeUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.ComputedUpdatePauseScopeUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedUpdatePauseScopePayload>[]
          }
          upsert: {
            args: Prisma.ComputedUpdatePauseScopeUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedUpdatePauseScopePayload>
          }
          aggregate: {
            args: Prisma.ComputedUpdatePauseScopeAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateComputedUpdatePauseScope>
          }
          groupBy: {
            args: Prisma.ComputedUpdatePauseScopeGroupByArgs<ExtArgs>
            result: $Utils.Optional<ComputedUpdatePauseScopeGroupByOutputType>[]
          }
          count: {
            args: Prisma.ComputedUpdatePauseScopeCountArgs<ExtArgs>
            result: $Utils.Optional<ComputedUpdatePauseScopeCountAggregateOutputType> | number
          }
        }
      }
      ComputedFieldActivity: {
        payload: Prisma.$ComputedFieldActivityPayload<ExtArgs>
        fields: Prisma.ComputedFieldActivityFieldRefs
        operations: {
          findUnique: {
            args: Prisma.ComputedFieldActivityFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedFieldActivityPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.ComputedFieldActivityFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedFieldActivityPayload>
          }
          findFirst: {
            args: Prisma.ComputedFieldActivityFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedFieldActivityPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.ComputedFieldActivityFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedFieldActivityPayload>
          }
          findMany: {
            args: Prisma.ComputedFieldActivityFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedFieldActivityPayload>[]
          }
          create: {
            args: Prisma.ComputedFieldActivityCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedFieldActivityPayload>
          }
          createMany: {
            args: Prisma.ComputedFieldActivityCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.ComputedFieldActivityCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedFieldActivityPayload>[]
          }
          delete: {
            args: Prisma.ComputedFieldActivityDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedFieldActivityPayload>
          }
          update: {
            args: Prisma.ComputedFieldActivityUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedFieldActivityPayload>
          }
          deleteMany: {
            args: Prisma.ComputedFieldActivityDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.ComputedFieldActivityUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.ComputedFieldActivityUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedFieldActivityPayload>[]
          }
          upsert: {
            args: Prisma.ComputedFieldActivityUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedFieldActivityPayload>
          }
          aggregate: {
            args: Prisma.ComputedFieldActivityAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateComputedFieldActivity>
          }
          groupBy: {
            args: Prisma.ComputedFieldActivityGroupByArgs<ExtArgs>
            result: $Utils.Optional<ComputedFieldActivityGroupByOutputType>[]
          }
          count: {
            args: Prisma.ComputedFieldActivityCountArgs<ExtArgs>
            result: $Utils.Optional<ComputedFieldActivityCountAggregateOutputType> | number
          }
        }
      }
      ComputedTableActivity: {
        payload: Prisma.$ComputedTableActivityPayload<ExtArgs>
        fields: Prisma.ComputedTableActivityFieldRefs
        operations: {
          findUnique: {
            args: Prisma.ComputedTableActivityFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedTableActivityPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.ComputedTableActivityFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedTableActivityPayload>
          }
          findFirst: {
            args: Prisma.ComputedTableActivityFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedTableActivityPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.ComputedTableActivityFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedTableActivityPayload>
          }
          findMany: {
            args: Prisma.ComputedTableActivityFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedTableActivityPayload>[]
          }
          create: {
            args: Prisma.ComputedTableActivityCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedTableActivityPayload>
          }
          createMany: {
            args: Prisma.ComputedTableActivityCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.ComputedTableActivityCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedTableActivityPayload>[]
          }
          delete: {
            args: Prisma.ComputedTableActivityDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedTableActivityPayload>
          }
          update: {
            args: Prisma.ComputedTableActivityUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedTableActivityPayload>
          }
          deleteMany: {
            args: Prisma.ComputedTableActivityDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.ComputedTableActivityUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.ComputedTableActivityUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedTableActivityPayload>[]
          }
          upsert: {
            args: Prisma.ComputedTableActivityUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedTableActivityPayload>
          }
          aggregate: {
            args: Prisma.ComputedTableActivityAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateComputedTableActivity>
          }
          groupBy: {
            args: Prisma.ComputedTableActivityGroupByArgs<ExtArgs>
            result: $Utils.Optional<ComputedTableActivityGroupByOutputType>[]
          }
          count: {
            args: Prisma.ComputedTableActivityCountArgs<ExtArgs>
            result: $Utils.Optional<ComputedTableActivityCountAggregateOutputType> | number
          }
        }
      }
      ComputedTaskFieldRef: {
        payload: Prisma.$ComputedTaskFieldRefPayload<ExtArgs>
        fields: Prisma.ComputedTaskFieldRefFieldRefs
        operations: {
          findUnique: {
            args: Prisma.ComputedTaskFieldRefFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedTaskFieldRefPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.ComputedTaskFieldRefFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedTaskFieldRefPayload>
          }
          findFirst: {
            args: Prisma.ComputedTaskFieldRefFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedTaskFieldRefPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.ComputedTaskFieldRefFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedTaskFieldRefPayload>
          }
          findMany: {
            args: Prisma.ComputedTaskFieldRefFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedTaskFieldRefPayload>[]
          }
          create: {
            args: Prisma.ComputedTaskFieldRefCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedTaskFieldRefPayload>
          }
          createMany: {
            args: Prisma.ComputedTaskFieldRefCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.ComputedTaskFieldRefCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedTaskFieldRefPayload>[]
          }
          delete: {
            args: Prisma.ComputedTaskFieldRefDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedTaskFieldRefPayload>
          }
          update: {
            args: Prisma.ComputedTaskFieldRefUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedTaskFieldRefPayload>
          }
          deleteMany: {
            args: Prisma.ComputedTaskFieldRefDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.ComputedTaskFieldRefUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.ComputedTaskFieldRefUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedTaskFieldRefPayload>[]
          }
          upsert: {
            args: Prisma.ComputedTaskFieldRefUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ComputedTaskFieldRefPayload>
          }
          aggregate: {
            args: Prisma.ComputedTaskFieldRefAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateComputedTaskFieldRef>
          }
          groupBy: {
            args: Prisma.ComputedTaskFieldRefGroupByArgs<ExtArgs>
            result: $Utils.Optional<ComputedTaskFieldRefGroupByOutputType>[]
          }
          count: {
            args: Prisma.ComputedTaskFieldRefCountArgs<ExtArgs>
            result: $Utils.Optional<ComputedTaskFieldRefCountAggregateOutputType> | number
          }
        }
      }
      RecordHistory: {
        payload: Prisma.$RecordHistoryPayload<ExtArgs>
        fields: Prisma.RecordHistoryFieldRefs
        operations: {
          findUnique: {
            args: Prisma.RecordHistoryFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RecordHistoryPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.RecordHistoryFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RecordHistoryPayload>
          }
          findFirst: {
            args: Prisma.RecordHistoryFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RecordHistoryPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.RecordHistoryFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RecordHistoryPayload>
          }
          findMany: {
            args: Prisma.RecordHistoryFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RecordHistoryPayload>[]
          }
          create: {
            args: Prisma.RecordHistoryCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RecordHistoryPayload>
          }
          createMany: {
            args: Prisma.RecordHistoryCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.RecordHistoryCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RecordHistoryPayload>[]
          }
          delete: {
            args: Prisma.RecordHistoryDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RecordHistoryPayload>
          }
          update: {
            args: Prisma.RecordHistoryUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RecordHistoryPayload>
          }
          deleteMany: {
            args: Prisma.RecordHistoryDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.RecordHistoryUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.RecordHistoryUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RecordHistoryPayload>[]
          }
          upsert: {
            args: Prisma.RecordHistoryUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RecordHistoryPayload>
          }
          aggregate: {
            args: Prisma.RecordHistoryAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateRecordHistory>
          }
          groupBy: {
            args: Prisma.RecordHistoryGroupByArgs<ExtArgs>
            result: $Utils.Optional<RecordHistoryGroupByOutputType>[]
          }
          count: {
            args: Prisma.RecordHistoryCountArgs<ExtArgs>
            result: $Utils.Optional<RecordHistoryCountAggregateOutputType> | number
          }
        }
      }
      TableTrash: {
        payload: Prisma.$TableTrashPayload<ExtArgs>
        fields: Prisma.TableTrashFieldRefs
        operations: {
          findUnique: {
            args: Prisma.TableTrashFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TableTrashPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.TableTrashFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TableTrashPayload>
          }
          findFirst: {
            args: Prisma.TableTrashFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TableTrashPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.TableTrashFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TableTrashPayload>
          }
          findMany: {
            args: Prisma.TableTrashFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TableTrashPayload>[]
          }
          create: {
            args: Prisma.TableTrashCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TableTrashPayload>
          }
          createMany: {
            args: Prisma.TableTrashCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.TableTrashCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TableTrashPayload>[]
          }
          delete: {
            args: Prisma.TableTrashDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TableTrashPayload>
          }
          update: {
            args: Prisma.TableTrashUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TableTrashPayload>
          }
          deleteMany: {
            args: Prisma.TableTrashDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.TableTrashUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.TableTrashUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TableTrashPayload>[]
          }
          upsert: {
            args: Prisma.TableTrashUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TableTrashPayload>
          }
          aggregate: {
            args: Prisma.TableTrashAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateTableTrash>
          }
          groupBy: {
            args: Prisma.TableTrashGroupByArgs<ExtArgs>
            result: $Utils.Optional<TableTrashGroupByOutputType>[]
          }
          count: {
            args: Prisma.TableTrashCountArgs<ExtArgs>
            result: $Utils.Optional<TableTrashCountAggregateOutputType> | number
          }
        }
      }
      RecordTrash: {
        payload: Prisma.$RecordTrashPayload<ExtArgs>
        fields: Prisma.RecordTrashFieldRefs
        operations: {
          findUnique: {
            args: Prisma.RecordTrashFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RecordTrashPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.RecordTrashFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RecordTrashPayload>
          }
          findFirst: {
            args: Prisma.RecordTrashFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RecordTrashPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.RecordTrashFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RecordTrashPayload>
          }
          findMany: {
            args: Prisma.RecordTrashFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RecordTrashPayload>[]
          }
          create: {
            args: Prisma.RecordTrashCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RecordTrashPayload>
          }
          createMany: {
            args: Prisma.RecordTrashCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.RecordTrashCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RecordTrashPayload>[]
          }
          delete: {
            args: Prisma.RecordTrashDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RecordTrashPayload>
          }
          update: {
            args: Prisma.RecordTrashUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RecordTrashPayload>
          }
          deleteMany: {
            args: Prisma.RecordTrashDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.RecordTrashUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.RecordTrashUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RecordTrashPayload>[]
          }
          upsert: {
            args: Prisma.RecordTrashUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RecordTrashPayload>
          }
          aggregate: {
            args: Prisma.RecordTrashAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateRecordTrash>
          }
          groupBy: {
            args: Prisma.RecordTrashGroupByArgs<ExtArgs>
            result: $Utils.Optional<RecordTrashGroupByOutputType>[]
          }
          count: {
            args: Prisma.RecordTrashCountArgs<ExtArgs>
            result: $Utils.Optional<RecordTrashCountAggregateOutputType> | number
          }
        }
      }
      Attachments: {
        payload: Prisma.$AttachmentsPayload<ExtArgs>
        fields: Prisma.AttachmentsFieldRefs
        operations: {
          findUnique: {
            args: Prisma.AttachmentsFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AttachmentsPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.AttachmentsFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AttachmentsPayload>
          }
          findFirst: {
            args: Prisma.AttachmentsFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AttachmentsPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.AttachmentsFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AttachmentsPayload>
          }
          findMany: {
            args: Prisma.AttachmentsFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AttachmentsPayload>[]
          }
          create: {
            args: Prisma.AttachmentsCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AttachmentsPayload>
          }
          createMany: {
            args: Prisma.AttachmentsCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.AttachmentsCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AttachmentsPayload>[]
          }
          delete: {
            args: Prisma.AttachmentsDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AttachmentsPayload>
          }
          update: {
            args: Prisma.AttachmentsUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AttachmentsPayload>
          }
          deleteMany: {
            args: Prisma.AttachmentsDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.AttachmentsUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.AttachmentsUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AttachmentsPayload>[]
          }
          upsert: {
            args: Prisma.AttachmentsUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AttachmentsPayload>
          }
          aggregate: {
            args: Prisma.AttachmentsAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateAttachments>
          }
          groupBy: {
            args: Prisma.AttachmentsGroupByArgs<ExtArgs>
            result: $Utils.Optional<AttachmentsGroupByOutputType>[]
          }
          count: {
            args: Prisma.AttachmentsCountArgs<ExtArgs>
            result: $Utils.Optional<AttachmentsCountAggregateOutputType> | number
          }
        }
      }
      AttachmentsTable: {
        payload: Prisma.$AttachmentsTablePayload<ExtArgs>
        fields: Prisma.AttachmentsTableFieldRefs
        operations: {
          findUnique: {
            args: Prisma.AttachmentsTableFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AttachmentsTablePayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.AttachmentsTableFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AttachmentsTablePayload>
          }
          findFirst: {
            args: Prisma.AttachmentsTableFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AttachmentsTablePayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.AttachmentsTableFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AttachmentsTablePayload>
          }
          findMany: {
            args: Prisma.AttachmentsTableFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AttachmentsTablePayload>[]
          }
          create: {
            args: Prisma.AttachmentsTableCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AttachmentsTablePayload>
          }
          createMany: {
            args: Prisma.AttachmentsTableCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.AttachmentsTableCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AttachmentsTablePayload>[]
          }
          delete: {
            args: Prisma.AttachmentsTableDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AttachmentsTablePayload>
          }
          update: {
            args: Prisma.AttachmentsTableUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AttachmentsTablePayload>
          }
          deleteMany: {
            args: Prisma.AttachmentsTableDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.AttachmentsTableUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.AttachmentsTableUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AttachmentsTablePayload>[]
          }
          upsert: {
            args: Prisma.AttachmentsTableUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AttachmentsTablePayload>
          }
          aggregate: {
            args: Prisma.AttachmentsTableAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateAttachmentsTable>
          }
          groupBy: {
            args: Prisma.AttachmentsTableGroupByArgs<ExtArgs>
            result: $Utils.Optional<AttachmentsTableGroupByOutputType>[]
          }
          count: {
            args: Prisma.AttachmentsTableCountArgs<ExtArgs>
            result: $Utils.Optional<AttachmentsTableCountAggregateOutputType> | number
          }
        }
      }
    }
  } & {
    other: {
      payload: any
      operations: {
        $executeRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $executeRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
        $queryRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $queryRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
      }
    }
  }
  export const defineExtension: $Extensions.ExtendsHook<"define", Prisma.TypeMapCb, $Extensions.DefaultArgs>
  export type DefaultPrismaClient = PrismaClient
  export type ErrorFormat = 'pretty' | 'colorless' | 'minimal'
  export interface PrismaClientOptions {
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasources?: Datasources
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasourceUrl?: string
    /**
     * @default "colorless"
     */
    errorFormat?: ErrorFormat
    /**
     * @example
     * ```
     * // Defaults to stdout
     * log: ['query', 'info', 'warn', 'error']
     * 
     * // Emit as events
     * log: [
     *   { emit: 'stdout', level: 'query' },
     *   { emit: 'stdout', level: 'info' },
     *   { emit: 'stdout', level: 'warn' }
     *   { emit: 'stdout', level: 'error' }
     * ]
     * ```
     * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/logging#the-log-option).
     */
    log?: (LogLevel | LogDefinition)[]
    /**
     * The default values for transactionOptions
     * maxWait ?= 2000
     * timeout ?= 5000
     */
    transactionOptions?: {
      maxWait?: number
      timeout?: number
      isolationLevel?: Prisma.TransactionIsolationLevel
    }
    /**
     * Instance of a Driver Adapter, e.g., like one provided by `@prisma/adapter-planetscale`
     */
    adapter?: runtime.DriverAdapter | null
    /**
     * Global configuration for omitting model fields by default.
     * 
     * @example
     * ```
     * const prisma = new PrismaClient({
     *   omit: {
     *     user: {
     *       password: true
     *     }
     *   }
     * })
     * ```
     */
    omit?: Prisma.GlobalOmitConfig
  }
  export type GlobalOmitConfig = {
    computedUpdateOutbox?: ComputedUpdateOutboxOmit
    computedUpdateOutboxSeed?: ComputedUpdateOutboxSeedOmit
    computedUpdateDeadLetter?: ComputedUpdateDeadLetterOmit
    computedUpdatePauseScope?: ComputedUpdatePauseScopeOmit
    computedFieldActivity?: ComputedFieldActivityOmit
    computedTableActivity?: ComputedTableActivityOmit
    computedTaskFieldRef?: ComputedTaskFieldRefOmit
    recordHistory?: RecordHistoryOmit
    tableTrash?: TableTrashOmit
    recordTrash?: RecordTrashOmit
    attachments?: AttachmentsOmit
    attachmentsTable?: AttachmentsTableOmit
  }

  /* Types for Logging */
  export type LogLevel = 'info' | 'query' | 'warn' | 'error'
  export type LogDefinition = {
    level: LogLevel
    emit: 'stdout' | 'event'
  }

  export type GetLogType<T extends LogLevel | LogDefinition> = T extends LogDefinition ? T['emit'] extends 'event' ? T['level'] : never : never
  export type GetEvents<T extends any> = T extends Array<LogLevel | LogDefinition> ?
    GetLogType<T[0]> | GetLogType<T[1]> | GetLogType<T[2]> | GetLogType<T[3]>
    : never

  export type QueryEvent = {
    timestamp: Date
    query: string
    params: string
    duration: number
    target: string
  }

  export type LogEvent = {
    timestamp: Date
    message: string
    target: string
  }
  /* End Types for Logging */


  export type PrismaAction =
    | 'findUnique'
    | 'findUniqueOrThrow'
    | 'findMany'
    | 'findFirst'
    | 'findFirstOrThrow'
    | 'create'
    | 'createMany'
    | 'createManyAndReturn'
    | 'update'
    | 'updateMany'
    | 'updateManyAndReturn'
    | 'upsert'
    | 'delete'
    | 'deleteMany'
    | 'executeRaw'
    | 'queryRaw'
    | 'aggregate'
    | 'count'
    | 'runCommandRaw'
    | 'findRaw'
    | 'groupBy'

  /**
   * These options are being passed into the middleware as "params"
   */
  export type MiddlewareParams = {
    model?: ModelName
    action: PrismaAction
    args: any
    dataPath: string[]
    runInTransaction: boolean
  }

  /**
   * The `T` type makes sure, that the `return proceed` is not forgotten in the middleware implementation
   */
  export type Middleware<T = any> = (
    params: MiddlewareParams,
    next: (params: MiddlewareParams) => $Utils.JsPromise<T>,
  ) => $Utils.JsPromise<T>

  // tested in getLogLevel.test.ts
  export function getLogLevel(log: Array<LogLevel | LogDefinition>): LogLevel | undefined;

  /**
   * `PrismaClient` proxy available in interactive transactions.
   */
  export type TransactionClient = Omit<Prisma.DefaultPrismaClient, runtime.ITXClientDenyList>

  export type Datasource = {
    url?: string
  }

  /**
   * Count Types
   */


  /**
   * Count Type ComputedUpdateOutboxCountOutputType
   */

  export type ComputedUpdateOutboxCountOutputType = {
    seeds: number
  }

  export type ComputedUpdateOutboxCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    seeds?: boolean | ComputedUpdateOutboxCountOutputTypeCountSeedsArgs
  }

  // Custom InputTypes
  /**
   * ComputedUpdateOutboxCountOutputType without action
   */
  export type ComputedUpdateOutboxCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdateOutboxCountOutputType
     */
    select?: ComputedUpdateOutboxCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * ComputedUpdateOutboxCountOutputType without action
   */
  export type ComputedUpdateOutboxCountOutputTypeCountSeedsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ComputedUpdateOutboxSeedWhereInput
  }


  /**
   * Models
   */

  /**
   * Model ComputedUpdateOutbox
   */

  export type AggregateComputedUpdateOutbox = {
    _count: ComputedUpdateOutboxCountAggregateOutputType | null
    _avg: ComputedUpdateOutboxAvgAggregateOutputType | null
    _sum: ComputedUpdateOutboxSumAggregateOutputType | null
    _min: ComputedUpdateOutboxMinAggregateOutputType | null
    _max: ComputedUpdateOutboxMaxAggregateOutputType | null
  }

  export type ComputedUpdateOutboxAvgAggregateOutputType = {
    attempts: number | null
    maxAttempts: number | null
    estimatedComplexity: number | null
    runTotalSteps: number | null
    runCompletedStepsBefore: number | null
    syncMaxLevel: number | null
  }

  export type ComputedUpdateOutboxSumAggregateOutputType = {
    attempts: number | null
    maxAttempts: number | null
    estimatedComplexity: number | null
    runTotalSteps: number | null
    runCompletedStepsBefore: number | null
    syncMaxLevel: number | null
  }

  export type ComputedUpdateOutboxMinAggregateOutputType = {
    id: string | null
    baseId: string | null
    seedTableId: string | null
    changeType: string | null
    status: string | null
    attempts: number | null
    maxAttempts: number | null
    nextRunAt: Date | null
    lockedAt: Date | null
    lockedBy: string | null
    lastError: string | null
    estimatedComplexity: number | null
    planHash: string | null
    runId: string | null
    runTotalSteps: number | null
    runCompletedStepsBefore: number | null
    syncMaxLevel: number | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type ComputedUpdateOutboxMaxAggregateOutputType = {
    id: string | null
    baseId: string | null
    seedTableId: string | null
    changeType: string | null
    status: string | null
    attempts: number | null
    maxAttempts: number | null
    nextRunAt: Date | null
    lockedAt: Date | null
    lockedBy: string | null
    lastError: string | null
    estimatedComplexity: number | null
    planHash: string | null
    runId: string | null
    runTotalSteps: number | null
    runCompletedStepsBefore: number | null
    syncMaxLevel: number | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type ComputedUpdateOutboxCountAggregateOutputType = {
    id: number
    baseId: number
    seedTableId: number
    seedRecordIds: number
    changeType: number
    steps: number
    edges: number
    status: number
    attempts: number
    maxAttempts: number
    nextRunAt: number
    lockedAt: number
    lockedBy: number
    lastError: number
    estimatedComplexity: number
    planHash: number
    dirtyStats: number
    runId: number
    originRunIds: number
    runTotalSteps: number
    runCompletedStepsBefore: number
    affectedTableIds: number
    affectedFieldIds: number
    syncMaxLevel: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type ComputedUpdateOutboxAvgAggregateInputType = {
    attempts?: true
    maxAttempts?: true
    estimatedComplexity?: true
    runTotalSteps?: true
    runCompletedStepsBefore?: true
    syncMaxLevel?: true
  }

  export type ComputedUpdateOutboxSumAggregateInputType = {
    attempts?: true
    maxAttempts?: true
    estimatedComplexity?: true
    runTotalSteps?: true
    runCompletedStepsBefore?: true
    syncMaxLevel?: true
  }

  export type ComputedUpdateOutboxMinAggregateInputType = {
    id?: true
    baseId?: true
    seedTableId?: true
    changeType?: true
    status?: true
    attempts?: true
    maxAttempts?: true
    nextRunAt?: true
    lockedAt?: true
    lockedBy?: true
    lastError?: true
    estimatedComplexity?: true
    planHash?: true
    runId?: true
    runTotalSteps?: true
    runCompletedStepsBefore?: true
    syncMaxLevel?: true
    createdAt?: true
    updatedAt?: true
  }

  export type ComputedUpdateOutboxMaxAggregateInputType = {
    id?: true
    baseId?: true
    seedTableId?: true
    changeType?: true
    status?: true
    attempts?: true
    maxAttempts?: true
    nextRunAt?: true
    lockedAt?: true
    lockedBy?: true
    lastError?: true
    estimatedComplexity?: true
    planHash?: true
    runId?: true
    runTotalSteps?: true
    runCompletedStepsBefore?: true
    syncMaxLevel?: true
    createdAt?: true
    updatedAt?: true
  }

  export type ComputedUpdateOutboxCountAggregateInputType = {
    id?: true
    baseId?: true
    seedTableId?: true
    seedRecordIds?: true
    changeType?: true
    steps?: true
    edges?: true
    status?: true
    attempts?: true
    maxAttempts?: true
    nextRunAt?: true
    lockedAt?: true
    lockedBy?: true
    lastError?: true
    estimatedComplexity?: true
    planHash?: true
    dirtyStats?: true
    runId?: true
    originRunIds?: true
    runTotalSteps?: true
    runCompletedStepsBefore?: true
    affectedTableIds?: true
    affectedFieldIds?: true
    syncMaxLevel?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type ComputedUpdateOutboxAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which ComputedUpdateOutbox to aggregate.
     */
    where?: ComputedUpdateOutboxWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ComputedUpdateOutboxes to fetch.
     */
    orderBy?: ComputedUpdateOutboxOrderByWithRelationInput | ComputedUpdateOutboxOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: ComputedUpdateOutboxWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ComputedUpdateOutboxes from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ComputedUpdateOutboxes.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned ComputedUpdateOutboxes
    **/
    _count?: true | ComputedUpdateOutboxCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: ComputedUpdateOutboxAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: ComputedUpdateOutboxSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: ComputedUpdateOutboxMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: ComputedUpdateOutboxMaxAggregateInputType
  }

  export type GetComputedUpdateOutboxAggregateType<T extends ComputedUpdateOutboxAggregateArgs> = {
        [P in keyof T & keyof AggregateComputedUpdateOutbox]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateComputedUpdateOutbox[P]>
      : GetScalarType<T[P], AggregateComputedUpdateOutbox[P]>
  }




  export type ComputedUpdateOutboxGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ComputedUpdateOutboxWhereInput
    orderBy?: ComputedUpdateOutboxOrderByWithAggregationInput | ComputedUpdateOutboxOrderByWithAggregationInput[]
    by: ComputedUpdateOutboxScalarFieldEnum[] | ComputedUpdateOutboxScalarFieldEnum
    having?: ComputedUpdateOutboxScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: ComputedUpdateOutboxCountAggregateInputType | true
    _avg?: ComputedUpdateOutboxAvgAggregateInputType
    _sum?: ComputedUpdateOutboxSumAggregateInputType
    _min?: ComputedUpdateOutboxMinAggregateInputType
    _max?: ComputedUpdateOutboxMaxAggregateInputType
  }

  export type ComputedUpdateOutboxGroupByOutputType = {
    id: string
    baseId: string
    seedTableId: string
    seedRecordIds: JsonValue | null
    changeType: string
    steps: JsonValue | null
    edges: JsonValue | null
    status: string
    attempts: number
    maxAttempts: number
    nextRunAt: Date
    lockedAt: Date | null
    lockedBy: string | null
    lastError: string | null
    estimatedComplexity: number
    planHash: string
    dirtyStats: JsonValue | null
    runId: string
    originRunIds: string[]
    runTotalSteps: number
    runCompletedStepsBefore: number
    affectedTableIds: string[]
    affectedFieldIds: string[]
    syncMaxLevel: number | null
    createdAt: Date
    updatedAt: Date
    _count: ComputedUpdateOutboxCountAggregateOutputType | null
    _avg: ComputedUpdateOutboxAvgAggregateOutputType | null
    _sum: ComputedUpdateOutboxSumAggregateOutputType | null
    _min: ComputedUpdateOutboxMinAggregateOutputType | null
    _max: ComputedUpdateOutboxMaxAggregateOutputType | null
  }

  type GetComputedUpdateOutboxGroupByPayload<T extends ComputedUpdateOutboxGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<ComputedUpdateOutboxGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof ComputedUpdateOutboxGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], ComputedUpdateOutboxGroupByOutputType[P]>
            : GetScalarType<T[P], ComputedUpdateOutboxGroupByOutputType[P]>
        }
      >
    >


  export type ComputedUpdateOutboxSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    baseId?: boolean
    seedTableId?: boolean
    seedRecordIds?: boolean
    changeType?: boolean
    steps?: boolean
    edges?: boolean
    status?: boolean
    attempts?: boolean
    maxAttempts?: boolean
    nextRunAt?: boolean
    lockedAt?: boolean
    lockedBy?: boolean
    lastError?: boolean
    estimatedComplexity?: boolean
    planHash?: boolean
    dirtyStats?: boolean
    runId?: boolean
    originRunIds?: boolean
    runTotalSteps?: boolean
    runCompletedStepsBefore?: boolean
    affectedTableIds?: boolean
    affectedFieldIds?: boolean
    syncMaxLevel?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    seeds?: boolean | ComputedUpdateOutbox$seedsArgs<ExtArgs>
    _count?: boolean | ComputedUpdateOutboxCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["computedUpdateOutbox"]>

  export type ComputedUpdateOutboxSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    baseId?: boolean
    seedTableId?: boolean
    seedRecordIds?: boolean
    changeType?: boolean
    steps?: boolean
    edges?: boolean
    status?: boolean
    attempts?: boolean
    maxAttempts?: boolean
    nextRunAt?: boolean
    lockedAt?: boolean
    lockedBy?: boolean
    lastError?: boolean
    estimatedComplexity?: boolean
    planHash?: boolean
    dirtyStats?: boolean
    runId?: boolean
    originRunIds?: boolean
    runTotalSteps?: boolean
    runCompletedStepsBefore?: boolean
    affectedTableIds?: boolean
    affectedFieldIds?: boolean
    syncMaxLevel?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["computedUpdateOutbox"]>

  export type ComputedUpdateOutboxSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    baseId?: boolean
    seedTableId?: boolean
    seedRecordIds?: boolean
    changeType?: boolean
    steps?: boolean
    edges?: boolean
    status?: boolean
    attempts?: boolean
    maxAttempts?: boolean
    nextRunAt?: boolean
    lockedAt?: boolean
    lockedBy?: boolean
    lastError?: boolean
    estimatedComplexity?: boolean
    planHash?: boolean
    dirtyStats?: boolean
    runId?: boolean
    originRunIds?: boolean
    runTotalSteps?: boolean
    runCompletedStepsBefore?: boolean
    affectedTableIds?: boolean
    affectedFieldIds?: boolean
    syncMaxLevel?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["computedUpdateOutbox"]>

  export type ComputedUpdateOutboxSelectScalar = {
    id?: boolean
    baseId?: boolean
    seedTableId?: boolean
    seedRecordIds?: boolean
    changeType?: boolean
    steps?: boolean
    edges?: boolean
    status?: boolean
    attempts?: boolean
    maxAttempts?: boolean
    nextRunAt?: boolean
    lockedAt?: boolean
    lockedBy?: boolean
    lastError?: boolean
    estimatedComplexity?: boolean
    planHash?: boolean
    dirtyStats?: boolean
    runId?: boolean
    originRunIds?: boolean
    runTotalSteps?: boolean
    runCompletedStepsBefore?: boolean
    affectedTableIds?: boolean
    affectedFieldIds?: boolean
    syncMaxLevel?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type ComputedUpdateOutboxOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "baseId" | "seedTableId" | "seedRecordIds" | "changeType" | "steps" | "edges" | "status" | "attempts" | "maxAttempts" | "nextRunAt" | "lockedAt" | "lockedBy" | "lastError" | "estimatedComplexity" | "planHash" | "dirtyStats" | "runId" | "originRunIds" | "runTotalSteps" | "runCompletedStepsBefore" | "affectedTableIds" | "affectedFieldIds" | "syncMaxLevel" | "createdAt" | "updatedAt", ExtArgs["result"]["computedUpdateOutbox"]>
  export type ComputedUpdateOutboxInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    seeds?: boolean | ComputedUpdateOutbox$seedsArgs<ExtArgs>
    _count?: boolean | ComputedUpdateOutboxCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type ComputedUpdateOutboxIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}
  export type ComputedUpdateOutboxIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}

  export type $ComputedUpdateOutboxPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "ComputedUpdateOutbox"
    objects: {
      seeds: Prisma.$ComputedUpdateOutboxSeedPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      baseId: string
      seedTableId: string
      seedRecordIds: Prisma.JsonValue | null
      changeType: string
      steps: Prisma.JsonValue | null
      edges: Prisma.JsonValue | null
      status: string
      attempts: number
      maxAttempts: number
      nextRunAt: Date
      lockedAt: Date | null
      lockedBy: string | null
      lastError: string | null
      estimatedComplexity: number
      planHash: string
      dirtyStats: Prisma.JsonValue | null
      runId: string
      originRunIds: string[]
      runTotalSteps: number
      runCompletedStepsBefore: number
      affectedTableIds: string[]
      affectedFieldIds: string[]
      syncMaxLevel: number | null
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["computedUpdateOutbox"]>
    composites: {}
  }

  type ComputedUpdateOutboxGetPayload<S extends boolean | null | undefined | ComputedUpdateOutboxDefaultArgs> = $Result.GetResult<Prisma.$ComputedUpdateOutboxPayload, S>

  type ComputedUpdateOutboxCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<ComputedUpdateOutboxFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: ComputedUpdateOutboxCountAggregateInputType | true
    }

  export interface ComputedUpdateOutboxDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['ComputedUpdateOutbox'], meta: { name: 'ComputedUpdateOutbox' } }
    /**
     * Find zero or one ComputedUpdateOutbox that matches the filter.
     * @param {ComputedUpdateOutboxFindUniqueArgs} args - Arguments to find a ComputedUpdateOutbox
     * @example
     * // Get one ComputedUpdateOutbox
     * const computedUpdateOutbox = await prisma.computedUpdateOutbox.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends ComputedUpdateOutboxFindUniqueArgs>(args: SelectSubset<T, ComputedUpdateOutboxFindUniqueArgs<ExtArgs>>): Prisma__ComputedUpdateOutboxClient<$Result.GetResult<Prisma.$ComputedUpdateOutboxPayload<ExtArgs>, T, "findUnique", ClientOptions> | null, null, ExtArgs, ClientOptions>

    /**
     * Find one ComputedUpdateOutbox that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {ComputedUpdateOutboxFindUniqueOrThrowArgs} args - Arguments to find a ComputedUpdateOutbox
     * @example
     * // Get one ComputedUpdateOutbox
     * const computedUpdateOutbox = await prisma.computedUpdateOutbox.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends ComputedUpdateOutboxFindUniqueOrThrowArgs>(args: SelectSubset<T, ComputedUpdateOutboxFindUniqueOrThrowArgs<ExtArgs>>): Prisma__ComputedUpdateOutboxClient<$Result.GetResult<Prisma.$ComputedUpdateOutboxPayload<ExtArgs>, T, "findUniqueOrThrow", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Find the first ComputedUpdateOutbox that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedUpdateOutboxFindFirstArgs} args - Arguments to find a ComputedUpdateOutbox
     * @example
     * // Get one ComputedUpdateOutbox
     * const computedUpdateOutbox = await prisma.computedUpdateOutbox.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends ComputedUpdateOutboxFindFirstArgs>(args?: SelectSubset<T, ComputedUpdateOutboxFindFirstArgs<ExtArgs>>): Prisma__ComputedUpdateOutboxClient<$Result.GetResult<Prisma.$ComputedUpdateOutboxPayload<ExtArgs>, T, "findFirst", ClientOptions> | null, null, ExtArgs, ClientOptions>

    /**
     * Find the first ComputedUpdateOutbox that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedUpdateOutboxFindFirstOrThrowArgs} args - Arguments to find a ComputedUpdateOutbox
     * @example
     * // Get one ComputedUpdateOutbox
     * const computedUpdateOutbox = await prisma.computedUpdateOutbox.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends ComputedUpdateOutboxFindFirstOrThrowArgs>(args?: SelectSubset<T, ComputedUpdateOutboxFindFirstOrThrowArgs<ExtArgs>>): Prisma__ComputedUpdateOutboxClient<$Result.GetResult<Prisma.$ComputedUpdateOutboxPayload<ExtArgs>, T, "findFirstOrThrow", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Find zero or more ComputedUpdateOutboxes that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedUpdateOutboxFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all ComputedUpdateOutboxes
     * const computedUpdateOutboxes = await prisma.computedUpdateOutbox.findMany()
     * 
     * // Get first 10 ComputedUpdateOutboxes
     * const computedUpdateOutboxes = await prisma.computedUpdateOutbox.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const computedUpdateOutboxWithIdOnly = await prisma.computedUpdateOutbox.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends ComputedUpdateOutboxFindManyArgs>(args?: SelectSubset<T, ComputedUpdateOutboxFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ComputedUpdateOutboxPayload<ExtArgs>, T, "findMany", ClientOptions>>

    /**
     * Create a ComputedUpdateOutbox.
     * @param {ComputedUpdateOutboxCreateArgs} args - Arguments to create a ComputedUpdateOutbox.
     * @example
     * // Create one ComputedUpdateOutbox
     * const ComputedUpdateOutbox = await prisma.computedUpdateOutbox.create({
     *   data: {
     *     // ... data to create a ComputedUpdateOutbox
     *   }
     * })
     * 
     */
    create<T extends ComputedUpdateOutboxCreateArgs>(args: SelectSubset<T, ComputedUpdateOutboxCreateArgs<ExtArgs>>): Prisma__ComputedUpdateOutboxClient<$Result.GetResult<Prisma.$ComputedUpdateOutboxPayload<ExtArgs>, T, "create", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Create many ComputedUpdateOutboxes.
     * @param {ComputedUpdateOutboxCreateManyArgs} args - Arguments to create many ComputedUpdateOutboxes.
     * @example
     * // Create many ComputedUpdateOutboxes
     * const computedUpdateOutbox = await prisma.computedUpdateOutbox.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends ComputedUpdateOutboxCreateManyArgs>(args?: SelectSubset<T, ComputedUpdateOutboxCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many ComputedUpdateOutboxes and returns the data saved in the database.
     * @param {ComputedUpdateOutboxCreateManyAndReturnArgs} args - Arguments to create many ComputedUpdateOutboxes.
     * @example
     * // Create many ComputedUpdateOutboxes
     * const computedUpdateOutbox = await prisma.computedUpdateOutbox.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many ComputedUpdateOutboxes and only return the `id`
     * const computedUpdateOutboxWithIdOnly = await prisma.computedUpdateOutbox.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends ComputedUpdateOutboxCreateManyAndReturnArgs>(args?: SelectSubset<T, ComputedUpdateOutboxCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ComputedUpdateOutboxPayload<ExtArgs>, T, "createManyAndReturn", ClientOptions>>

    /**
     * Delete a ComputedUpdateOutbox.
     * @param {ComputedUpdateOutboxDeleteArgs} args - Arguments to delete one ComputedUpdateOutbox.
     * @example
     * // Delete one ComputedUpdateOutbox
     * const ComputedUpdateOutbox = await prisma.computedUpdateOutbox.delete({
     *   where: {
     *     // ... filter to delete one ComputedUpdateOutbox
     *   }
     * })
     * 
     */
    delete<T extends ComputedUpdateOutboxDeleteArgs>(args: SelectSubset<T, ComputedUpdateOutboxDeleteArgs<ExtArgs>>): Prisma__ComputedUpdateOutboxClient<$Result.GetResult<Prisma.$ComputedUpdateOutboxPayload<ExtArgs>, T, "delete", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Update one ComputedUpdateOutbox.
     * @param {ComputedUpdateOutboxUpdateArgs} args - Arguments to update one ComputedUpdateOutbox.
     * @example
     * // Update one ComputedUpdateOutbox
     * const computedUpdateOutbox = await prisma.computedUpdateOutbox.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends ComputedUpdateOutboxUpdateArgs>(args: SelectSubset<T, ComputedUpdateOutboxUpdateArgs<ExtArgs>>): Prisma__ComputedUpdateOutboxClient<$Result.GetResult<Prisma.$ComputedUpdateOutboxPayload<ExtArgs>, T, "update", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Delete zero or more ComputedUpdateOutboxes.
     * @param {ComputedUpdateOutboxDeleteManyArgs} args - Arguments to filter ComputedUpdateOutboxes to delete.
     * @example
     * // Delete a few ComputedUpdateOutboxes
     * const { count } = await prisma.computedUpdateOutbox.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends ComputedUpdateOutboxDeleteManyArgs>(args?: SelectSubset<T, ComputedUpdateOutboxDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more ComputedUpdateOutboxes.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedUpdateOutboxUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many ComputedUpdateOutboxes
     * const computedUpdateOutbox = await prisma.computedUpdateOutbox.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends ComputedUpdateOutboxUpdateManyArgs>(args: SelectSubset<T, ComputedUpdateOutboxUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more ComputedUpdateOutboxes and returns the data updated in the database.
     * @param {ComputedUpdateOutboxUpdateManyAndReturnArgs} args - Arguments to update many ComputedUpdateOutboxes.
     * @example
     * // Update many ComputedUpdateOutboxes
     * const computedUpdateOutbox = await prisma.computedUpdateOutbox.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more ComputedUpdateOutboxes and only return the `id`
     * const computedUpdateOutboxWithIdOnly = await prisma.computedUpdateOutbox.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends ComputedUpdateOutboxUpdateManyAndReturnArgs>(args: SelectSubset<T, ComputedUpdateOutboxUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ComputedUpdateOutboxPayload<ExtArgs>, T, "updateManyAndReturn", ClientOptions>>

    /**
     * Create or update one ComputedUpdateOutbox.
     * @param {ComputedUpdateOutboxUpsertArgs} args - Arguments to update or create a ComputedUpdateOutbox.
     * @example
     * // Update or create a ComputedUpdateOutbox
     * const computedUpdateOutbox = await prisma.computedUpdateOutbox.upsert({
     *   create: {
     *     // ... data to create a ComputedUpdateOutbox
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the ComputedUpdateOutbox we want to update
     *   }
     * })
     */
    upsert<T extends ComputedUpdateOutboxUpsertArgs>(args: SelectSubset<T, ComputedUpdateOutboxUpsertArgs<ExtArgs>>): Prisma__ComputedUpdateOutboxClient<$Result.GetResult<Prisma.$ComputedUpdateOutboxPayload<ExtArgs>, T, "upsert", ClientOptions>, never, ExtArgs, ClientOptions>


    /**
     * Count the number of ComputedUpdateOutboxes.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedUpdateOutboxCountArgs} args - Arguments to filter ComputedUpdateOutboxes to count.
     * @example
     * // Count the number of ComputedUpdateOutboxes
     * const count = await prisma.computedUpdateOutbox.count({
     *   where: {
     *     // ... the filter for the ComputedUpdateOutboxes we want to count
     *   }
     * })
    **/
    count<T extends ComputedUpdateOutboxCountArgs>(
      args?: Subset<T, ComputedUpdateOutboxCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], ComputedUpdateOutboxCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a ComputedUpdateOutbox.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedUpdateOutboxAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends ComputedUpdateOutboxAggregateArgs>(args: Subset<T, ComputedUpdateOutboxAggregateArgs>): Prisma.PrismaPromise<GetComputedUpdateOutboxAggregateType<T>>

    /**
     * Group by ComputedUpdateOutbox.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedUpdateOutboxGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends ComputedUpdateOutboxGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: ComputedUpdateOutboxGroupByArgs['orderBy'] }
        : { orderBy?: ComputedUpdateOutboxGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, ComputedUpdateOutboxGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetComputedUpdateOutboxGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the ComputedUpdateOutbox model
   */
  readonly fields: ComputedUpdateOutboxFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for ComputedUpdateOutbox.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__ComputedUpdateOutboxClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    seeds<T extends ComputedUpdateOutbox$seedsArgs<ExtArgs> = {}>(args?: Subset<T, ComputedUpdateOutbox$seedsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ComputedUpdateOutboxSeedPayload<ExtArgs>, T, "findMany", ClientOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the ComputedUpdateOutbox model
   */ 
  interface ComputedUpdateOutboxFieldRefs {
    readonly id: FieldRef<"ComputedUpdateOutbox", 'String'>
    readonly baseId: FieldRef<"ComputedUpdateOutbox", 'String'>
    readonly seedTableId: FieldRef<"ComputedUpdateOutbox", 'String'>
    readonly seedRecordIds: FieldRef<"ComputedUpdateOutbox", 'Json'>
    readonly changeType: FieldRef<"ComputedUpdateOutbox", 'String'>
    readonly steps: FieldRef<"ComputedUpdateOutbox", 'Json'>
    readonly edges: FieldRef<"ComputedUpdateOutbox", 'Json'>
    readonly status: FieldRef<"ComputedUpdateOutbox", 'String'>
    readonly attempts: FieldRef<"ComputedUpdateOutbox", 'Int'>
    readonly maxAttempts: FieldRef<"ComputedUpdateOutbox", 'Int'>
    readonly nextRunAt: FieldRef<"ComputedUpdateOutbox", 'DateTime'>
    readonly lockedAt: FieldRef<"ComputedUpdateOutbox", 'DateTime'>
    readonly lockedBy: FieldRef<"ComputedUpdateOutbox", 'String'>
    readonly lastError: FieldRef<"ComputedUpdateOutbox", 'String'>
    readonly estimatedComplexity: FieldRef<"ComputedUpdateOutbox", 'Int'>
    readonly planHash: FieldRef<"ComputedUpdateOutbox", 'String'>
    readonly dirtyStats: FieldRef<"ComputedUpdateOutbox", 'Json'>
    readonly runId: FieldRef<"ComputedUpdateOutbox", 'String'>
    readonly originRunIds: FieldRef<"ComputedUpdateOutbox", 'String[]'>
    readonly runTotalSteps: FieldRef<"ComputedUpdateOutbox", 'Int'>
    readonly runCompletedStepsBefore: FieldRef<"ComputedUpdateOutbox", 'Int'>
    readonly affectedTableIds: FieldRef<"ComputedUpdateOutbox", 'String[]'>
    readonly affectedFieldIds: FieldRef<"ComputedUpdateOutbox", 'String[]'>
    readonly syncMaxLevel: FieldRef<"ComputedUpdateOutbox", 'Int'>
    readonly createdAt: FieldRef<"ComputedUpdateOutbox", 'DateTime'>
    readonly updatedAt: FieldRef<"ComputedUpdateOutbox", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * ComputedUpdateOutbox findUnique
   */
  export type ComputedUpdateOutboxFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdateOutbox
     */
    select?: ComputedUpdateOutboxSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdateOutbox
     */
    omit?: ComputedUpdateOutboxOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ComputedUpdateOutboxInclude<ExtArgs> | null
    /**
     * Filter, which ComputedUpdateOutbox to fetch.
     */
    where: ComputedUpdateOutboxWhereUniqueInput
  }

  /**
   * ComputedUpdateOutbox findUniqueOrThrow
   */
  export type ComputedUpdateOutboxFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdateOutbox
     */
    select?: ComputedUpdateOutboxSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdateOutbox
     */
    omit?: ComputedUpdateOutboxOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ComputedUpdateOutboxInclude<ExtArgs> | null
    /**
     * Filter, which ComputedUpdateOutbox to fetch.
     */
    where: ComputedUpdateOutboxWhereUniqueInput
  }

  /**
   * ComputedUpdateOutbox findFirst
   */
  export type ComputedUpdateOutboxFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdateOutbox
     */
    select?: ComputedUpdateOutboxSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdateOutbox
     */
    omit?: ComputedUpdateOutboxOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ComputedUpdateOutboxInclude<ExtArgs> | null
    /**
     * Filter, which ComputedUpdateOutbox to fetch.
     */
    where?: ComputedUpdateOutboxWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ComputedUpdateOutboxes to fetch.
     */
    orderBy?: ComputedUpdateOutboxOrderByWithRelationInput | ComputedUpdateOutboxOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for ComputedUpdateOutboxes.
     */
    cursor?: ComputedUpdateOutboxWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ComputedUpdateOutboxes from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ComputedUpdateOutboxes.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of ComputedUpdateOutboxes.
     */
    distinct?: ComputedUpdateOutboxScalarFieldEnum | ComputedUpdateOutboxScalarFieldEnum[]
  }

  /**
   * ComputedUpdateOutbox findFirstOrThrow
   */
  export type ComputedUpdateOutboxFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdateOutbox
     */
    select?: ComputedUpdateOutboxSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdateOutbox
     */
    omit?: ComputedUpdateOutboxOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ComputedUpdateOutboxInclude<ExtArgs> | null
    /**
     * Filter, which ComputedUpdateOutbox to fetch.
     */
    where?: ComputedUpdateOutboxWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ComputedUpdateOutboxes to fetch.
     */
    orderBy?: ComputedUpdateOutboxOrderByWithRelationInput | ComputedUpdateOutboxOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for ComputedUpdateOutboxes.
     */
    cursor?: ComputedUpdateOutboxWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ComputedUpdateOutboxes from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ComputedUpdateOutboxes.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of ComputedUpdateOutboxes.
     */
    distinct?: ComputedUpdateOutboxScalarFieldEnum | ComputedUpdateOutboxScalarFieldEnum[]
  }

  /**
   * ComputedUpdateOutbox findMany
   */
  export type ComputedUpdateOutboxFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdateOutbox
     */
    select?: ComputedUpdateOutboxSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdateOutbox
     */
    omit?: ComputedUpdateOutboxOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ComputedUpdateOutboxInclude<ExtArgs> | null
    /**
     * Filter, which ComputedUpdateOutboxes to fetch.
     */
    where?: ComputedUpdateOutboxWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ComputedUpdateOutboxes to fetch.
     */
    orderBy?: ComputedUpdateOutboxOrderByWithRelationInput | ComputedUpdateOutboxOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing ComputedUpdateOutboxes.
     */
    cursor?: ComputedUpdateOutboxWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ComputedUpdateOutboxes from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ComputedUpdateOutboxes.
     */
    skip?: number
    distinct?: ComputedUpdateOutboxScalarFieldEnum | ComputedUpdateOutboxScalarFieldEnum[]
  }

  /**
   * ComputedUpdateOutbox create
   */
  export type ComputedUpdateOutboxCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdateOutbox
     */
    select?: ComputedUpdateOutboxSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdateOutbox
     */
    omit?: ComputedUpdateOutboxOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ComputedUpdateOutboxInclude<ExtArgs> | null
    /**
     * The data needed to create a ComputedUpdateOutbox.
     */
    data: XOR<ComputedUpdateOutboxCreateInput, ComputedUpdateOutboxUncheckedCreateInput>
  }

  /**
   * ComputedUpdateOutbox createMany
   */
  export type ComputedUpdateOutboxCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many ComputedUpdateOutboxes.
     */
    data: ComputedUpdateOutboxCreateManyInput | ComputedUpdateOutboxCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * ComputedUpdateOutbox createManyAndReturn
   */
  export type ComputedUpdateOutboxCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdateOutbox
     */
    select?: ComputedUpdateOutboxSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdateOutbox
     */
    omit?: ComputedUpdateOutboxOmit<ExtArgs> | null
    /**
     * The data used to create many ComputedUpdateOutboxes.
     */
    data: ComputedUpdateOutboxCreateManyInput | ComputedUpdateOutboxCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * ComputedUpdateOutbox update
   */
  export type ComputedUpdateOutboxUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdateOutbox
     */
    select?: ComputedUpdateOutboxSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdateOutbox
     */
    omit?: ComputedUpdateOutboxOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ComputedUpdateOutboxInclude<ExtArgs> | null
    /**
     * The data needed to update a ComputedUpdateOutbox.
     */
    data: XOR<ComputedUpdateOutboxUpdateInput, ComputedUpdateOutboxUncheckedUpdateInput>
    /**
     * Choose, which ComputedUpdateOutbox to update.
     */
    where: ComputedUpdateOutboxWhereUniqueInput
  }

  /**
   * ComputedUpdateOutbox updateMany
   */
  export type ComputedUpdateOutboxUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update ComputedUpdateOutboxes.
     */
    data: XOR<ComputedUpdateOutboxUpdateManyMutationInput, ComputedUpdateOutboxUncheckedUpdateManyInput>
    /**
     * Filter which ComputedUpdateOutboxes to update
     */
    where?: ComputedUpdateOutboxWhereInput
  }

  /**
   * ComputedUpdateOutbox updateManyAndReturn
   */
  export type ComputedUpdateOutboxUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdateOutbox
     */
    select?: ComputedUpdateOutboxSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdateOutbox
     */
    omit?: ComputedUpdateOutboxOmit<ExtArgs> | null
    /**
     * The data used to update ComputedUpdateOutboxes.
     */
    data: XOR<ComputedUpdateOutboxUpdateManyMutationInput, ComputedUpdateOutboxUncheckedUpdateManyInput>
    /**
     * Filter which ComputedUpdateOutboxes to update
     */
    where?: ComputedUpdateOutboxWhereInput
  }

  /**
   * ComputedUpdateOutbox upsert
   */
  export type ComputedUpdateOutboxUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdateOutbox
     */
    select?: ComputedUpdateOutboxSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdateOutbox
     */
    omit?: ComputedUpdateOutboxOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ComputedUpdateOutboxInclude<ExtArgs> | null
    /**
     * The filter to search for the ComputedUpdateOutbox to update in case it exists.
     */
    where: ComputedUpdateOutboxWhereUniqueInput
    /**
     * In case the ComputedUpdateOutbox found by the `where` argument doesn't exist, create a new ComputedUpdateOutbox with this data.
     */
    create: XOR<ComputedUpdateOutboxCreateInput, ComputedUpdateOutboxUncheckedCreateInput>
    /**
     * In case the ComputedUpdateOutbox was found with the provided `where` argument, update it with this data.
     */
    update: XOR<ComputedUpdateOutboxUpdateInput, ComputedUpdateOutboxUncheckedUpdateInput>
  }

  /**
   * ComputedUpdateOutbox delete
   */
  export type ComputedUpdateOutboxDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdateOutbox
     */
    select?: ComputedUpdateOutboxSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdateOutbox
     */
    omit?: ComputedUpdateOutboxOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ComputedUpdateOutboxInclude<ExtArgs> | null
    /**
     * Filter which ComputedUpdateOutbox to delete.
     */
    where: ComputedUpdateOutboxWhereUniqueInput
  }

  /**
   * ComputedUpdateOutbox deleteMany
   */
  export type ComputedUpdateOutboxDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which ComputedUpdateOutboxes to delete
     */
    where?: ComputedUpdateOutboxWhereInput
  }

  /**
   * ComputedUpdateOutbox.seeds
   */
  export type ComputedUpdateOutbox$seedsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdateOutboxSeed
     */
    select?: ComputedUpdateOutboxSeedSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdateOutboxSeed
     */
    omit?: ComputedUpdateOutboxSeedOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ComputedUpdateOutboxSeedInclude<ExtArgs> | null
    where?: ComputedUpdateOutboxSeedWhereInput
    orderBy?: ComputedUpdateOutboxSeedOrderByWithRelationInput | ComputedUpdateOutboxSeedOrderByWithRelationInput[]
    cursor?: ComputedUpdateOutboxSeedWhereUniqueInput
    take?: number
    skip?: number
    distinct?: ComputedUpdateOutboxSeedScalarFieldEnum | ComputedUpdateOutboxSeedScalarFieldEnum[]
  }

  /**
   * ComputedUpdateOutbox without action
   */
  export type ComputedUpdateOutboxDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdateOutbox
     */
    select?: ComputedUpdateOutboxSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdateOutbox
     */
    omit?: ComputedUpdateOutboxOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ComputedUpdateOutboxInclude<ExtArgs> | null
  }


  /**
   * Model ComputedUpdateOutboxSeed
   */

  export type AggregateComputedUpdateOutboxSeed = {
    _count: ComputedUpdateOutboxSeedCountAggregateOutputType | null
    _min: ComputedUpdateOutboxSeedMinAggregateOutputType | null
    _max: ComputedUpdateOutboxSeedMaxAggregateOutputType | null
  }

  export type ComputedUpdateOutboxSeedMinAggregateOutputType = {
    id: string | null
    taskId: string | null
    tableId: string | null
    recordId: string | null
  }

  export type ComputedUpdateOutboxSeedMaxAggregateOutputType = {
    id: string | null
    taskId: string | null
    tableId: string | null
    recordId: string | null
  }

  export type ComputedUpdateOutboxSeedCountAggregateOutputType = {
    id: number
    taskId: number
    tableId: number
    recordId: number
    _all: number
  }


  export type ComputedUpdateOutboxSeedMinAggregateInputType = {
    id?: true
    taskId?: true
    tableId?: true
    recordId?: true
  }

  export type ComputedUpdateOutboxSeedMaxAggregateInputType = {
    id?: true
    taskId?: true
    tableId?: true
    recordId?: true
  }

  export type ComputedUpdateOutboxSeedCountAggregateInputType = {
    id?: true
    taskId?: true
    tableId?: true
    recordId?: true
    _all?: true
  }

  export type ComputedUpdateOutboxSeedAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which ComputedUpdateOutboxSeed to aggregate.
     */
    where?: ComputedUpdateOutboxSeedWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ComputedUpdateOutboxSeeds to fetch.
     */
    orderBy?: ComputedUpdateOutboxSeedOrderByWithRelationInput | ComputedUpdateOutboxSeedOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: ComputedUpdateOutboxSeedWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ComputedUpdateOutboxSeeds from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ComputedUpdateOutboxSeeds.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned ComputedUpdateOutboxSeeds
    **/
    _count?: true | ComputedUpdateOutboxSeedCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: ComputedUpdateOutboxSeedMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: ComputedUpdateOutboxSeedMaxAggregateInputType
  }

  export type GetComputedUpdateOutboxSeedAggregateType<T extends ComputedUpdateOutboxSeedAggregateArgs> = {
        [P in keyof T & keyof AggregateComputedUpdateOutboxSeed]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateComputedUpdateOutboxSeed[P]>
      : GetScalarType<T[P], AggregateComputedUpdateOutboxSeed[P]>
  }




  export type ComputedUpdateOutboxSeedGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ComputedUpdateOutboxSeedWhereInput
    orderBy?: ComputedUpdateOutboxSeedOrderByWithAggregationInput | ComputedUpdateOutboxSeedOrderByWithAggregationInput[]
    by: ComputedUpdateOutboxSeedScalarFieldEnum[] | ComputedUpdateOutboxSeedScalarFieldEnum
    having?: ComputedUpdateOutboxSeedScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: ComputedUpdateOutboxSeedCountAggregateInputType | true
    _min?: ComputedUpdateOutboxSeedMinAggregateInputType
    _max?: ComputedUpdateOutboxSeedMaxAggregateInputType
  }

  export type ComputedUpdateOutboxSeedGroupByOutputType = {
    id: string
    taskId: string
    tableId: string
    recordId: string
    _count: ComputedUpdateOutboxSeedCountAggregateOutputType | null
    _min: ComputedUpdateOutboxSeedMinAggregateOutputType | null
    _max: ComputedUpdateOutboxSeedMaxAggregateOutputType | null
  }

  type GetComputedUpdateOutboxSeedGroupByPayload<T extends ComputedUpdateOutboxSeedGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<ComputedUpdateOutboxSeedGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof ComputedUpdateOutboxSeedGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], ComputedUpdateOutboxSeedGroupByOutputType[P]>
            : GetScalarType<T[P], ComputedUpdateOutboxSeedGroupByOutputType[P]>
        }
      >
    >


  export type ComputedUpdateOutboxSeedSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    taskId?: boolean
    tableId?: boolean
    recordId?: boolean
    task?: boolean | ComputedUpdateOutboxDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["computedUpdateOutboxSeed"]>

  export type ComputedUpdateOutboxSeedSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    taskId?: boolean
    tableId?: boolean
    recordId?: boolean
    task?: boolean | ComputedUpdateOutboxDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["computedUpdateOutboxSeed"]>

  export type ComputedUpdateOutboxSeedSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    taskId?: boolean
    tableId?: boolean
    recordId?: boolean
    task?: boolean | ComputedUpdateOutboxDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["computedUpdateOutboxSeed"]>

  export type ComputedUpdateOutboxSeedSelectScalar = {
    id?: boolean
    taskId?: boolean
    tableId?: boolean
    recordId?: boolean
  }

  export type ComputedUpdateOutboxSeedOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "taskId" | "tableId" | "recordId", ExtArgs["result"]["computedUpdateOutboxSeed"]>
  export type ComputedUpdateOutboxSeedInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    task?: boolean | ComputedUpdateOutboxDefaultArgs<ExtArgs>
  }
  export type ComputedUpdateOutboxSeedIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    task?: boolean | ComputedUpdateOutboxDefaultArgs<ExtArgs>
  }
  export type ComputedUpdateOutboxSeedIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    task?: boolean | ComputedUpdateOutboxDefaultArgs<ExtArgs>
  }

  export type $ComputedUpdateOutboxSeedPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "ComputedUpdateOutboxSeed"
    objects: {
      task: Prisma.$ComputedUpdateOutboxPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      taskId: string
      tableId: string
      recordId: string
    }, ExtArgs["result"]["computedUpdateOutboxSeed"]>
    composites: {}
  }

  type ComputedUpdateOutboxSeedGetPayload<S extends boolean | null | undefined | ComputedUpdateOutboxSeedDefaultArgs> = $Result.GetResult<Prisma.$ComputedUpdateOutboxSeedPayload, S>

  type ComputedUpdateOutboxSeedCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<ComputedUpdateOutboxSeedFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: ComputedUpdateOutboxSeedCountAggregateInputType | true
    }

  export interface ComputedUpdateOutboxSeedDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['ComputedUpdateOutboxSeed'], meta: { name: 'ComputedUpdateOutboxSeed' } }
    /**
     * Find zero or one ComputedUpdateOutboxSeed that matches the filter.
     * @param {ComputedUpdateOutboxSeedFindUniqueArgs} args - Arguments to find a ComputedUpdateOutboxSeed
     * @example
     * // Get one ComputedUpdateOutboxSeed
     * const computedUpdateOutboxSeed = await prisma.computedUpdateOutboxSeed.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends ComputedUpdateOutboxSeedFindUniqueArgs>(args: SelectSubset<T, ComputedUpdateOutboxSeedFindUniqueArgs<ExtArgs>>): Prisma__ComputedUpdateOutboxSeedClient<$Result.GetResult<Prisma.$ComputedUpdateOutboxSeedPayload<ExtArgs>, T, "findUnique", ClientOptions> | null, null, ExtArgs, ClientOptions>

    /**
     * Find one ComputedUpdateOutboxSeed that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {ComputedUpdateOutboxSeedFindUniqueOrThrowArgs} args - Arguments to find a ComputedUpdateOutboxSeed
     * @example
     * // Get one ComputedUpdateOutboxSeed
     * const computedUpdateOutboxSeed = await prisma.computedUpdateOutboxSeed.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends ComputedUpdateOutboxSeedFindUniqueOrThrowArgs>(args: SelectSubset<T, ComputedUpdateOutboxSeedFindUniqueOrThrowArgs<ExtArgs>>): Prisma__ComputedUpdateOutboxSeedClient<$Result.GetResult<Prisma.$ComputedUpdateOutboxSeedPayload<ExtArgs>, T, "findUniqueOrThrow", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Find the first ComputedUpdateOutboxSeed that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedUpdateOutboxSeedFindFirstArgs} args - Arguments to find a ComputedUpdateOutboxSeed
     * @example
     * // Get one ComputedUpdateOutboxSeed
     * const computedUpdateOutboxSeed = await prisma.computedUpdateOutboxSeed.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends ComputedUpdateOutboxSeedFindFirstArgs>(args?: SelectSubset<T, ComputedUpdateOutboxSeedFindFirstArgs<ExtArgs>>): Prisma__ComputedUpdateOutboxSeedClient<$Result.GetResult<Prisma.$ComputedUpdateOutboxSeedPayload<ExtArgs>, T, "findFirst", ClientOptions> | null, null, ExtArgs, ClientOptions>

    /**
     * Find the first ComputedUpdateOutboxSeed that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedUpdateOutboxSeedFindFirstOrThrowArgs} args - Arguments to find a ComputedUpdateOutboxSeed
     * @example
     * // Get one ComputedUpdateOutboxSeed
     * const computedUpdateOutboxSeed = await prisma.computedUpdateOutboxSeed.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends ComputedUpdateOutboxSeedFindFirstOrThrowArgs>(args?: SelectSubset<T, ComputedUpdateOutboxSeedFindFirstOrThrowArgs<ExtArgs>>): Prisma__ComputedUpdateOutboxSeedClient<$Result.GetResult<Prisma.$ComputedUpdateOutboxSeedPayload<ExtArgs>, T, "findFirstOrThrow", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Find zero or more ComputedUpdateOutboxSeeds that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedUpdateOutboxSeedFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all ComputedUpdateOutboxSeeds
     * const computedUpdateOutboxSeeds = await prisma.computedUpdateOutboxSeed.findMany()
     * 
     * // Get first 10 ComputedUpdateOutboxSeeds
     * const computedUpdateOutboxSeeds = await prisma.computedUpdateOutboxSeed.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const computedUpdateOutboxSeedWithIdOnly = await prisma.computedUpdateOutboxSeed.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends ComputedUpdateOutboxSeedFindManyArgs>(args?: SelectSubset<T, ComputedUpdateOutboxSeedFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ComputedUpdateOutboxSeedPayload<ExtArgs>, T, "findMany", ClientOptions>>

    /**
     * Create a ComputedUpdateOutboxSeed.
     * @param {ComputedUpdateOutboxSeedCreateArgs} args - Arguments to create a ComputedUpdateOutboxSeed.
     * @example
     * // Create one ComputedUpdateOutboxSeed
     * const ComputedUpdateOutboxSeed = await prisma.computedUpdateOutboxSeed.create({
     *   data: {
     *     // ... data to create a ComputedUpdateOutboxSeed
     *   }
     * })
     * 
     */
    create<T extends ComputedUpdateOutboxSeedCreateArgs>(args: SelectSubset<T, ComputedUpdateOutboxSeedCreateArgs<ExtArgs>>): Prisma__ComputedUpdateOutboxSeedClient<$Result.GetResult<Prisma.$ComputedUpdateOutboxSeedPayload<ExtArgs>, T, "create", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Create many ComputedUpdateOutboxSeeds.
     * @param {ComputedUpdateOutboxSeedCreateManyArgs} args - Arguments to create many ComputedUpdateOutboxSeeds.
     * @example
     * // Create many ComputedUpdateOutboxSeeds
     * const computedUpdateOutboxSeed = await prisma.computedUpdateOutboxSeed.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends ComputedUpdateOutboxSeedCreateManyArgs>(args?: SelectSubset<T, ComputedUpdateOutboxSeedCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many ComputedUpdateOutboxSeeds and returns the data saved in the database.
     * @param {ComputedUpdateOutboxSeedCreateManyAndReturnArgs} args - Arguments to create many ComputedUpdateOutboxSeeds.
     * @example
     * // Create many ComputedUpdateOutboxSeeds
     * const computedUpdateOutboxSeed = await prisma.computedUpdateOutboxSeed.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many ComputedUpdateOutboxSeeds and only return the `id`
     * const computedUpdateOutboxSeedWithIdOnly = await prisma.computedUpdateOutboxSeed.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends ComputedUpdateOutboxSeedCreateManyAndReturnArgs>(args?: SelectSubset<T, ComputedUpdateOutboxSeedCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ComputedUpdateOutboxSeedPayload<ExtArgs>, T, "createManyAndReturn", ClientOptions>>

    /**
     * Delete a ComputedUpdateOutboxSeed.
     * @param {ComputedUpdateOutboxSeedDeleteArgs} args - Arguments to delete one ComputedUpdateOutboxSeed.
     * @example
     * // Delete one ComputedUpdateOutboxSeed
     * const ComputedUpdateOutboxSeed = await prisma.computedUpdateOutboxSeed.delete({
     *   where: {
     *     // ... filter to delete one ComputedUpdateOutboxSeed
     *   }
     * })
     * 
     */
    delete<T extends ComputedUpdateOutboxSeedDeleteArgs>(args: SelectSubset<T, ComputedUpdateOutboxSeedDeleteArgs<ExtArgs>>): Prisma__ComputedUpdateOutboxSeedClient<$Result.GetResult<Prisma.$ComputedUpdateOutboxSeedPayload<ExtArgs>, T, "delete", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Update one ComputedUpdateOutboxSeed.
     * @param {ComputedUpdateOutboxSeedUpdateArgs} args - Arguments to update one ComputedUpdateOutboxSeed.
     * @example
     * // Update one ComputedUpdateOutboxSeed
     * const computedUpdateOutboxSeed = await prisma.computedUpdateOutboxSeed.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends ComputedUpdateOutboxSeedUpdateArgs>(args: SelectSubset<T, ComputedUpdateOutboxSeedUpdateArgs<ExtArgs>>): Prisma__ComputedUpdateOutboxSeedClient<$Result.GetResult<Prisma.$ComputedUpdateOutboxSeedPayload<ExtArgs>, T, "update", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Delete zero or more ComputedUpdateOutboxSeeds.
     * @param {ComputedUpdateOutboxSeedDeleteManyArgs} args - Arguments to filter ComputedUpdateOutboxSeeds to delete.
     * @example
     * // Delete a few ComputedUpdateOutboxSeeds
     * const { count } = await prisma.computedUpdateOutboxSeed.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends ComputedUpdateOutboxSeedDeleteManyArgs>(args?: SelectSubset<T, ComputedUpdateOutboxSeedDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more ComputedUpdateOutboxSeeds.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedUpdateOutboxSeedUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many ComputedUpdateOutboxSeeds
     * const computedUpdateOutboxSeed = await prisma.computedUpdateOutboxSeed.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends ComputedUpdateOutboxSeedUpdateManyArgs>(args: SelectSubset<T, ComputedUpdateOutboxSeedUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more ComputedUpdateOutboxSeeds and returns the data updated in the database.
     * @param {ComputedUpdateOutboxSeedUpdateManyAndReturnArgs} args - Arguments to update many ComputedUpdateOutboxSeeds.
     * @example
     * // Update many ComputedUpdateOutboxSeeds
     * const computedUpdateOutboxSeed = await prisma.computedUpdateOutboxSeed.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more ComputedUpdateOutboxSeeds and only return the `id`
     * const computedUpdateOutboxSeedWithIdOnly = await prisma.computedUpdateOutboxSeed.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends ComputedUpdateOutboxSeedUpdateManyAndReturnArgs>(args: SelectSubset<T, ComputedUpdateOutboxSeedUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ComputedUpdateOutboxSeedPayload<ExtArgs>, T, "updateManyAndReturn", ClientOptions>>

    /**
     * Create or update one ComputedUpdateOutboxSeed.
     * @param {ComputedUpdateOutboxSeedUpsertArgs} args - Arguments to update or create a ComputedUpdateOutboxSeed.
     * @example
     * // Update or create a ComputedUpdateOutboxSeed
     * const computedUpdateOutboxSeed = await prisma.computedUpdateOutboxSeed.upsert({
     *   create: {
     *     // ... data to create a ComputedUpdateOutboxSeed
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the ComputedUpdateOutboxSeed we want to update
     *   }
     * })
     */
    upsert<T extends ComputedUpdateOutboxSeedUpsertArgs>(args: SelectSubset<T, ComputedUpdateOutboxSeedUpsertArgs<ExtArgs>>): Prisma__ComputedUpdateOutboxSeedClient<$Result.GetResult<Prisma.$ComputedUpdateOutboxSeedPayload<ExtArgs>, T, "upsert", ClientOptions>, never, ExtArgs, ClientOptions>


    /**
     * Count the number of ComputedUpdateOutboxSeeds.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedUpdateOutboxSeedCountArgs} args - Arguments to filter ComputedUpdateOutboxSeeds to count.
     * @example
     * // Count the number of ComputedUpdateOutboxSeeds
     * const count = await prisma.computedUpdateOutboxSeed.count({
     *   where: {
     *     // ... the filter for the ComputedUpdateOutboxSeeds we want to count
     *   }
     * })
    **/
    count<T extends ComputedUpdateOutboxSeedCountArgs>(
      args?: Subset<T, ComputedUpdateOutboxSeedCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], ComputedUpdateOutboxSeedCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a ComputedUpdateOutboxSeed.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedUpdateOutboxSeedAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends ComputedUpdateOutboxSeedAggregateArgs>(args: Subset<T, ComputedUpdateOutboxSeedAggregateArgs>): Prisma.PrismaPromise<GetComputedUpdateOutboxSeedAggregateType<T>>

    /**
     * Group by ComputedUpdateOutboxSeed.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedUpdateOutboxSeedGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends ComputedUpdateOutboxSeedGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: ComputedUpdateOutboxSeedGroupByArgs['orderBy'] }
        : { orderBy?: ComputedUpdateOutboxSeedGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, ComputedUpdateOutboxSeedGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetComputedUpdateOutboxSeedGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the ComputedUpdateOutboxSeed model
   */
  readonly fields: ComputedUpdateOutboxSeedFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for ComputedUpdateOutboxSeed.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__ComputedUpdateOutboxSeedClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    task<T extends ComputedUpdateOutboxDefaultArgs<ExtArgs> = {}>(args?: Subset<T, ComputedUpdateOutboxDefaultArgs<ExtArgs>>): Prisma__ComputedUpdateOutboxClient<$Result.GetResult<Prisma.$ComputedUpdateOutboxPayload<ExtArgs>, T, "findUniqueOrThrow", ClientOptions> | Null, Null, ExtArgs, ClientOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the ComputedUpdateOutboxSeed model
   */ 
  interface ComputedUpdateOutboxSeedFieldRefs {
    readonly id: FieldRef<"ComputedUpdateOutboxSeed", 'String'>
    readonly taskId: FieldRef<"ComputedUpdateOutboxSeed", 'String'>
    readonly tableId: FieldRef<"ComputedUpdateOutboxSeed", 'String'>
    readonly recordId: FieldRef<"ComputedUpdateOutboxSeed", 'String'>
  }
    

  // Custom InputTypes
  /**
   * ComputedUpdateOutboxSeed findUnique
   */
  export type ComputedUpdateOutboxSeedFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdateOutboxSeed
     */
    select?: ComputedUpdateOutboxSeedSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdateOutboxSeed
     */
    omit?: ComputedUpdateOutboxSeedOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ComputedUpdateOutboxSeedInclude<ExtArgs> | null
    /**
     * Filter, which ComputedUpdateOutboxSeed to fetch.
     */
    where: ComputedUpdateOutboxSeedWhereUniqueInput
  }

  /**
   * ComputedUpdateOutboxSeed findUniqueOrThrow
   */
  export type ComputedUpdateOutboxSeedFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdateOutboxSeed
     */
    select?: ComputedUpdateOutboxSeedSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdateOutboxSeed
     */
    omit?: ComputedUpdateOutboxSeedOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ComputedUpdateOutboxSeedInclude<ExtArgs> | null
    /**
     * Filter, which ComputedUpdateOutboxSeed to fetch.
     */
    where: ComputedUpdateOutboxSeedWhereUniqueInput
  }

  /**
   * ComputedUpdateOutboxSeed findFirst
   */
  export type ComputedUpdateOutboxSeedFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdateOutboxSeed
     */
    select?: ComputedUpdateOutboxSeedSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdateOutboxSeed
     */
    omit?: ComputedUpdateOutboxSeedOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ComputedUpdateOutboxSeedInclude<ExtArgs> | null
    /**
     * Filter, which ComputedUpdateOutboxSeed to fetch.
     */
    where?: ComputedUpdateOutboxSeedWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ComputedUpdateOutboxSeeds to fetch.
     */
    orderBy?: ComputedUpdateOutboxSeedOrderByWithRelationInput | ComputedUpdateOutboxSeedOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for ComputedUpdateOutboxSeeds.
     */
    cursor?: ComputedUpdateOutboxSeedWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ComputedUpdateOutboxSeeds from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ComputedUpdateOutboxSeeds.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of ComputedUpdateOutboxSeeds.
     */
    distinct?: ComputedUpdateOutboxSeedScalarFieldEnum | ComputedUpdateOutboxSeedScalarFieldEnum[]
  }

  /**
   * ComputedUpdateOutboxSeed findFirstOrThrow
   */
  export type ComputedUpdateOutboxSeedFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdateOutboxSeed
     */
    select?: ComputedUpdateOutboxSeedSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdateOutboxSeed
     */
    omit?: ComputedUpdateOutboxSeedOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ComputedUpdateOutboxSeedInclude<ExtArgs> | null
    /**
     * Filter, which ComputedUpdateOutboxSeed to fetch.
     */
    where?: ComputedUpdateOutboxSeedWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ComputedUpdateOutboxSeeds to fetch.
     */
    orderBy?: ComputedUpdateOutboxSeedOrderByWithRelationInput | ComputedUpdateOutboxSeedOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for ComputedUpdateOutboxSeeds.
     */
    cursor?: ComputedUpdateOutboxSeedWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ComputedUpdateOutboxSeeds from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ComputedUpdateOutboxSeeds.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of ComputedUpdateOutboxSeeds.
     */
    distinct?: ComputedUpdateOutboxSeedScalarFieldEnum | ComputedUpdateOutboxSeedScalarFieldEnum[]
  }

  /**
   * ComputedUpdateOutboxSeed findMany
   */
  export type ComputedUpdateOutboxSeedFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdateOutboxSeed
     */
    select?: ComputedUpdateOutboxSeedSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdateOutboxSeed
     */
    omit?: ComputedUpdateOutboxSeedOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ComputedUpdateOutboxSeedInclude<ExtArgs> | null
    /**
     * Filter, which ComputedUpdateOutboxSeeds to fetch.
     */
    where?: ComputedUpdateOutboxSeedWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ComputedUpdateOutboxSeeds to fetch.
     */
    orderBy?: ComputedUpdateOutboxSeedOrderByWithRelationInput | ComputedUpdateOutboxSeedOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing ComputedUpdateOutboxSeeds.
     */
    cursor?: ComputedUpdateOutboxSeedWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ComputedUpdateOutboxSeeds from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ComputedUpdateOutboxSeeds.
     */
    skip?: number
    distinct?: ComputedUpdateOutboxSeedScalarFieldEnum | ComputedUpdateOutboxSeedScalarFieldEnum[]
  }

  /**
   * ComputedUpdateOutboxSeed create
   */
  export type ComputedUpdateOutboxSeedCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdateOutboxSeed
     */
    select?: ComputedUpdateOutboxSeedSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdateOutboxSeed
     */
    omit?: ComputedUpdateOutboxSeedOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ComputedUpdateOutboxSeedInclude<ExtArgs> | null
    /**
     * The data needed to create a ComputedUpdateOutboxSeed.
     */
    data: XOR<ComputedUpdateOutboxSeedCreateInput, ComputedUpdateOutboxSeedUncheckedCreateInput>
  }

  /**
   * ComputedUpdateOutboxSeed createMany
   */
  export type ComputedUpdateOutboxSeedCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many ComputedUpdateOutboxSeeds.
     */
    data: ComputedUpdateOutboxSeedCreateManyInput | ComputedUpdateOutboxSeedCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * ComputedUpdateOutboxSeed createManyAndReturn
   */
  export type ComputedUpdateOutboxSeedCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdateOutboxSeed
     */
    select?: ComputedUpdateOutboxSeedSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdateOutboxSeed
     */
    omit?: ComputedUpdateOutboxSeedOmit<ExtArgs> | null
    /**
     * The data used to create many ComputedUpdateOutboxSeeds.
     */
    data: ComputedUpdateOutboxSeedCreateManyInput | ComputedUpdateOutboxSeedCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ComputedUpdateOutboxSeedIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * ComputedUpdateOutboxSeed update
   */
  export type ComputedUpdateOutboxSeedUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdateOutboxSeed
     */
    select?: ComputedUpdateOutboxSeedSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdateOutboxSeed
     */
    omit?: ComputedUpdateOutboxSeedOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ComputedUpdateOutboxSeedInclude<ExtArgs> | null
    /**
     * The data needed to update a ComputedUpdateOutboxSeed.
     */
    data: XOR<ComputedUpdateOutboxSeedUpdateInput, ComputedUpdateOutboxSeedUncheckedUpdateInput>
    /**
     * Choose, which ComputedUpdateOutboxSeed to update.
     */
    where: ComputedUpdateOutboxSeedWhereUniqueInput
  }

  /**
   * ComputedUpdateOutboxSeed updateMany
   */
  export type ComputedUpdateOutboxSeedUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update ComputedUpdateOutboxSeeds.
     */
    data: XOR<ComputedUpdateOutboxSeedUpdateManyMutationInput, ComputedUpdateOutboxSeedUncheckedUpdateManyInput>
    /**
     * Filter which ComputedUpdateOutboxSeeds to update
     */
    where?: ComputedUpdateOutboxSeedWhereInput
  }

  /**
   * ComputedUpdateOutboxSeed updateManyAndReturn
   */
  export type ComputedUpdateOutboxSeedUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdateOutboxSeed
     */
    select?: ComputedUpdateOutboxSeedSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdateOutboxSeed
     */
    omit?: ComputedUpdateOutboxSeedOmit<ExtArgs> | null
    /**
     * The data used to update ComputedUpdateOutboxSeeds.
     */
    data: XOR<ComputedUpdateOutboxSeedUpdateManyMutationInput, ComputedUpdateOutboxSeedUncheckedUpdateManyInput>
    /**
     * Filter which ComputedUpdateOutboxSeeds to update
     */
    where?: ComputedUpdateOutboxSeedWhereInput
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ComputedUpdateOutboxSeedIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * ComputedUpdateOutboxSeed upsert
   */
  export type ComputedUpdateOutboxSeedUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdateOutboxSeed
     */
    select?: ComputedUpdateOutboxSeedSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdateOutboxSeed
     */
    omit?: ComputedUpdateOutboxSeedOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ComputedUpdateOutboxSeedInclude<ExtArgs> | null
    /**
     * The filter to search for the ComputedUpdateOutboxSeed to update in case it exists.
     */
    where: ComputedUpdateOutboxSeedWhereUniqueInput
    /**
     * In case the ComputedUpdateOutboxSeed found by the `where` argument doesn't exist, create a new ComputedUpdateOutboxSeed with this data.
     */
    create: XOR<ComputedUpdateOutboxSeedCreateInput, ComputedUpdateOutboxSeedUncheckedCreateInput>
    /**
     * In case the ComputedUpdateOutboxSeed was found with the provided `where` argument, update it with this data.
     */
    update: XOR<ComputedUpdateOutboxSeedUpdateInput, ComputedUpdateOutboxSeedUncheckedUpdateInput>
  }

  /**
   * ComputedUpdateOutboxSeed delete
   */
  export type ComputedUpdateOutboxSeedDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdateOutboxSeed
     */
    select?: ComputedUpdateOutboxSeedSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdateOutboxSeed
     */
    omit?: ComputedUpdateOutboxSeedOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ComputedUpdateOutboxSeedInclude<ExtArgs> | null
    /**
     * Filter which ComputedUpdateOutboxSeed to delete.
     */
    where: ComputedUpdateOutboxSeedWhereUniqueInput
  }

  /**
   * ComputedUpdateOutboxSeed deleteMany
   */
  export type ComputedUpdateOutboxSeedDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which ComputedUpdateOutboxSeeds to delete
     */
    where?: ComputedUpdateOutboxSeedWhereInput
  }

  /**
   * ComputedUpdateOutboxSeed without action
   */
  export type ComputedUpdateOutboxSeedDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdateOutboxSeed
     */
    select?: ComputedUpdateOutboxSeedSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdateOutboxSeed
     */
    omit?: ComputedUpdateOutboxSeedOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ComputedUpdateOutboxSeedInclude<ExtArgs> | null
  }


  /**
   * Model ComputedUpdateDeadLetter
   */

  export type AggregateComputedUpdateDeadLetter = {
    _count: ComputedUpdateDeadLetterCountAggregateOutputType | null
    _avg: ComputedUpdateDeadLetterAvgAggregateOutputType | null
    _sum: ComputedUpdateDeadLetterSumAggregateOutputType | null
    _min: ComputedUpdateDeadLetterMinAggregateOutputType | null
    _max: ComputedUpdateDeadLetterMaxAggregateOutputType | null
  }

  export type ComputedUpdateDeadLetterAvgAggregateOutputType = {
    attempts: number | null
    maxAttempts: number | null
    estimatedComplexity: number | null
    runTotalSteps: number | null
    runCompletedStepsBefore: number | null
    syncMaxLevel: number | null
  }

  export type ComputedUpdateDeadLetterSumAggregateOutputType = {
    attempts: number | null
    maxAttempts: number | null
    estimatedComplexity: number | null
    runTotalSteps: number | null
    runCompletedStepsBefore: number | null
    syncMaxLevel: number | null
  }

  export type ComputedUpdateDeadLetterMinAggregateOutputType = {
    id: string | null
    baseId: string | null
    seedTableId: string | null
    changeType: string | null
    status: string | null
    attempts: number | null
    maxAttempts: number | null
    nextRunAt: Date | null
    lockedAt: Date | null
    lockedBy: string | null
    lastError: string | null
    estimatedComplexity: number | null
    planHash: string | null
    runId: string | null
    runTotalSteps: number | null
    runCompletedStepsBefore: number | null
    syncMaxLevel: number | null
    failedAt: Date | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type ComputedUpdateDeadLetterMaxAggregateOutputType = {
    id: string | null
    baseId: string | null
    seedTableId: string | null
    changeType: string | null
    status: string | null
    attempts: number | null
    maxAttempts: number | null
    nextRunAt: Date | null
    lockedAt: Date | null
    lockedBy: string | null
    lastError: string | null
    estimatedComplexity: number | null
    planHash: string | null
    runId: string | null
    runTotalSteps: number | null
    runCompletedStepsBefore: number | null
    syncMaxLevel: number | null
    failedAt: Date | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type ComputedUpdateDeadLetterCountAggregateOutputType = {
    id: number
    baseId: number
    seedTableId: number
    seedRecordIds: number
    changeType: number
    steps: number
    edges: number
    status: number
    attempts: number
    maxAttempts: number
    nextRunAt: number
    lockedAt: number
    lockedBy: number
    lastError: number
    estimatedComplexity: number
    planHash: number
    dirtyStats: number
    runId: number
    originRunIds: number
    runTotalSteps: number
    runCompletedStepsBefore: number
    affectedTableIds: number
    affectedFieldIds: number
    syncMaxLevel: number
    traceData: number
    failedAt: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type ComputedUpdateDeadLetterAvgAggregateInputType = {
    attempts?: true
    maxAttempts?: true
    estimatedComplexity?: true
    runTotalSteps?: true
    runCompletedStepsBefore?: true
    syncMaxLevel?: true
  }

  export type ComputedUpdateDeadLetterSumAggregateInputType = {
    attempts?: true
    maxAttempts?: true
    estimatedComplexity?: true
    runTotalSteps?: true
    runCompletedStepsBefore?: true
    syncMaxLevel?: true
  }

  export type ComputedUpdateDeadLetterMinAggregateInputType = {
    id?: true
    baseId?: true
    seedTableId?: true
    changeType?: true
    status?: true
    attempts?: true
    maxAttempts?: true
    nextRunAt?: true
    lockedAt?: true
    lockedBy?: true
    lastError?: true
    estimatedComplexity?: true
    planHash?: true
    runId?: true
    runTotalSteps?: true
    runCompletedStepsBefore?: true
    syncMaxLevel?: true
    failedAt?: true
    createdAt?: true
    updatedAt?: true
  }

  export type ComputedUpdateDeadLetterMaxAggregateInputType = {
    id?: true
    baseId?: true
    seedTableId?: true
    changeType?: true
    status?: true
    attempts?: true
    maxAttempts?: true
    nextRunAt?: true
    lockedAt?: true
    lockedBy?: true
    lastError?: true
    estimatedComplexity?: true
    planHash?: true
    runId?: true
    runTotalSteps?: true
    runCompletedStepsBefore?: true
    syncMaxLevel?: true
    failedAt?: true
    createdAt?: true
    updatedAt?: true
  }

  export type ComputedUpdateDeadLetterCountAggregateInputType = {
    id?: true
    baseId?: true
    seedTableId?: true
    seedRecordIds?: true
    changeType?: true
    steps?: true
    edges?: true
    status?: true
    attempts?: true
    maxAttempts?: true
    nextRunAt?: true
    lockedAt?: true
    lockedBy?: true
    lastError?: true
    estimatedComplexity?: true
    planHash?: true
    dirtyStats?: true
    runId?: true
    originRunIds?: true
    runTotalSteps?: true
    runCompletedStepsBefore?: true
    affectedTableIds?: true
    affectedFieldIds?: true
    syncMaxLevel?: true
    traceData?: true
    failedAt?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type ComputedUpdateDeadLetterAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which ComputedUpdateDeadLetter to aggregate.
     */
    where?: ComputedUpdateDeadLetterWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ComputedUpdateDeadLetters to fetch.
     */
    orderBy?: ComputedUpdateDeadLetterOrderByWithRelationInput | ComputedUpdateDeadLetterOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: ComputedUpdateDeadLetterWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ComputedUpdateDeadLetters from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ComputedUpdateDeadLetters.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned ComputedUpdateDeadLetters
    **/
    _count?: true | ComputedUpdateDeadLetterCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: ComputedUpdateDeadLetterAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: ComputedUpdateDeadLetterSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: ComputedUpdateDeadLetterMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: ComputedUpdateDeadLetterMaxAggregateInputType
  }

  export type GetComputedUpdateDeadLetterAggregateType<T extends ComputedUpdateDeadLetterAggregateArgs> = {
        [P in keyof T & keyof AggregateComputedUpdateDeadLetter]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateComputedUpdateDeadLetter[P]>
      : GetScalarType<T[P], AggregateComputedUpdateDeadLetter[P]>
  }




  export type ComputedUpdateDeadLetterGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ComputedUpdateDeadLetterWhereInput
    orderBy?: ComputedUpdateDeadLetterOrderByWithAggregationInput | ComputedUpdateDeadLetterOrderByWithAggregationInput[]
    by: ComputedUpdateDeadLetterScalarFieldEnum[] | ComputedUpdateDeadLetterScalarFieldEnum
    having?: ComputedUpdateDeadLetterScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: ComputedUpdateDeadLetterCountAggregateInputType | true
    _avg?: ComputedUpdateDeadLetterAvgAggregateInputType
    _sum?: ComputedUpdateDeadLetterSumAggregateInputType
    _min?: ComputedUpdateDeadLetterMinAggregateInputType
    _max?: ComputedUpdateDeadLetterMaxAggregateInputType
  }

  export type ComputedUpdateDeadLetterGroupByOutputType = {
    id: string
    baseId: string
    seedTableId: string
    seedRecordIds: JsonValue | null
    changeType: string
    steps: JsonValue | null
    edges: JsonValue | null
    status: string
    attempts: number
    maxAttempts: number
    nextRunAt: Date
    lockedAt: Date | null
    lockedBy: string | null
    lastError: string | null
    estimatedComplexity: number
    planHash: string
    dirtyStats: JsonValue | null
    runId: string
    originRunIds: string[]
    runTotalSteps: number
    runCompletedStepsBefore: number
    affectedTableIds: string[]
    affectedFieldIds: string[]
    syncMaxLevel: number | null
    traceData: JsonValue | null
    failedAt: Date
    createdAt: Date
    updatedAt: Date
    _count: ComputedUpdateDeadLetterCountAggregateOutputType | null
    _avg: ComputedUpdateDeadLetterAvgAggregateOutputType | null
    _sum: ComputedUpdateDeadLetterSumAggregateOutputType | null
    _min: ComputedUpdateDeadLetterMinAggregateOutputType | null
    _max: ComputedUpdateDeadLetterMaxAggregateOutputType | null
  }

  type GetComputedUpdateDeadLetterGroupByPayload<T extends ComputedUpdateDeadLetterGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<ComputedUpdateDeadLetterGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof ComputedUpdateDeadLetterGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], ComputedUpdateDeadLetterGroupByOutputType[P]>
            : GetScalarType<T[P], ComputedUpdateDeadLetterGroupByOutputType[P]>
        }
      >
    >


  export type ComputedUpdateDeadLetterSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    baseId?: boolean
    seedTableId?: boolean
    seedRecordIds?: boolean
    changeType?: boolean
    steps?: boolean
    edges?: boolean
    status?: boolean
    attempts?: boolean
    maxAttempts?: boolean
    nextRunAt?: boolean
    lockedAt?: boolean
    lockedBy?: boolean
    lastError?: boolean
    estimatedComplexity?: boolean
    planHash?: boolean
    dirtyStats?: boolean
    runId?: boolean
    originRunIds?: boolean
    runTotalSteps?: boolean
    runCompletedStepsBefore?: boolean
    affectedTableIds?: boolean
    affectedFieldIds?: boolean
    syncMaxLevel?: boolean
    traceData?: boolean
    failedAt?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["computedUpdateDeadLetter"]>

  export type ComputedUpdateDeadLetterSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    baseId?: boolean
    seedTableId?: boolean
    seedRecordIds?: boolean
    changeType?: boolean
    steps?: boolean
    edges?: boolean
    status?: boolean
    attempts?: boolean
    maxAttempts?: boolean
    nextRunAt?: boolean
    lockedAt?: boolean
    lockedBy?: boolean
    lastError?: boolean
    estimatedComplexity?: boolean
    planHash?: boolean
    dirtyStats?: boolean
    runId?: boolean
    originRunIds?: boolean
    runTotalSteps?: boolean
    runCompletedStepsBefore?: boolean
    affectedTableIds?: boolean
    affectedFieldIds?: boolean
    syncMaxLevel?: boolean
    traceData?: boolean
    failedAt?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["computedUpdateDeadLetter"]>

  export type ComputedUpdateDeadLetterSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    baseId?: boolean
    seedTableId?: boolean
    seedRecordIds?: boolean
    changeType?: boolean
    steps?: boolean
    edges?: boolean
    status?: boolean
    attempts?: boolean
    maxAttempts?: boolean
    nextRunAt?: boolean
    lockedAt?: boolean
    lockedBy?: boolean
    lastError?: boolean
    estimatedComplexity?: boolean
    planHash?: boolean
    dirtyStats?: boolean
    runId?: boolean
    originRunIds?: boolean
    runTotalSteps?: boolean
    runCompletedStepsBefore?: boolean
    affectedTableIds?: boolean
    affectedFieldIds?: boolean
    syncMaxLevel?: boolean
    traceData?: boolean
    failedAt?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["computedUpdateDeadLetter"]>

  export type ComputedUpdateDeadLetterSelectScalar = {
    id?: boolean
    baseId?: boolean
    seedTableId?: boolean
    seedRecordIds?: boolean
    changeType?: boolean
    steps?: boolean
    edges?: boolean
    status?: boolean
    attempts?: boolean
    maxAttempts?: boolean
    nextRunAt?: boolean
    lockedAt?: boolean
    lockedBy?: boolean
    lastError?: boolean
    estimatedComplexity?: boolean
    planHash?: boolean
    dirtyStats?: boolean
    runId?: boolean
    originRunIds?: boolean
    runTotalSteps?: boolean
    runCompletedStepsBefore?: boolean
    affectedTableIds?: boolean
    affectedFieldIds?: boolean
    syncMaxLevel?: boolean
    traceData?: boolean
    failedAt?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type ComputedUpdateDeadLetterOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "baseId" | "seedTableId" | "seedRecordIds" | "changeType" | "steps" | "edges" | "status" | "attempts" | "maxAttempts" | "nextRunAt" | "lockedAt" | "lockedBy" | "lastError" | "estimatedComplexity" | "planHash" | "dirtyStats" | "runId" | "originRunIds" | "runTotalSteps" | "runCompletedStepsBefore" | "affectedTableIds" | "affectedFieldIds" | "syncMaxLevel" | "traceData" | "failedAt" | "createdAt" | "updatedAt", ExtArgs["result"]["computedUpdateDeadLetter"]>

  export type $ComputedUpdateDeadLetterPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "ComputedUpdateDeadLetter"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      baseId: string
      seedTableId: string
      seedRecordIds: Prisma.JsonValue | null
      changeType: string
      steps: Prisma.JsonValue | null
      edges: Prisma.JsonValue | null
      status: string
      attempts: number
      maxAttempts: number
      nextRunAt: Date
      lockedAt: Date | null
      lockedBy: string | null
      lastError: string | null
      estimatedComplexity: number
      planHash: string
      dirtyStats: Prisma.JsonValue | null
      runId: string
      originRunIds: string[]
      runTotalSteps: number
      runCompletedStepsBefore: number
      affectedTableIds: string[]
      affectedFieldIds: string[]
      syncMaxLevel: number | null
      traceData: Prisma.JsonValue | null
      failedAt: Date
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["computedUpdateDeadLetter"]>
    composites: {}
  }

  type ComputedUpdateDeadLetterGetPayload<S extends boolean | null | undefined | ComputedUpdateDeadLetterDefaultArgs> = $Result.GetResult<Prisma.$ComputedUpdateDeadLetterPayload, S>

  type ComputedUpdateDeadLetterCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<ComputedUpdateDeadLetterFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: ComputedUpdateDeadLetterCountAggregateInputType | true
    }

  export interface ComputedUpdateDeadLetterDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['ComputedUpdateDeadLetter'], meta: { name: 'ComputedUpdateDeadLetter' } }
    /**
     * Find zero or one ComputedUpdateDeadLetter that matches the filter.
     * @param {ComputedUpdateDeadLetterFindUniqueArgs} args - Arguments to find a ComputedUpdateDeadLetter
     * @example
     * // Get one ComputedUpdateDeadLetter
     * const computedUpdateDeadLetter = await prisma.computedUpdateDeadLetter.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends ComputedUpdateDeadLetterFindUniqueArgs>(args: SelectSubset<T, ComputedUpdateDeadLetterFindUniqueArgs<ExtArgs>>): Prisma__ComputedUpdateDeadLetterClient<$Result.GetResult<Prisma.$ComputedUpdateDeadLetterPayload<ExtArgs>, T, "findUnique", ClientOptions> | null, null, ExtArgs, ClientOptions>

    /**
     * Find one ComputedUpdateDeadLetter that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {ComputedUpdateDeadLetterFindUniqueOrThrowArgs} args - Arguments to find a ComputedUpdateDeadLetter
     * @example
     * // Get one ComputedUpdateDeadLetter
     * const computedUpdateDeadLetter = await prisma.computedUpdateDeadLetter.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends ComputedUpdateDeadLetterFindUniqueOrThrowArgs>(args: SelectSubset<T, ComputedUpdateDeadLetterFindUniqueOrThrowArgs<ExtArgs>>): Prisma__ComputedUpdateDeadLetterClient<$Result.GetResult<Prisma.$ComputedUpdateDeadLetterPayload<ExtArgs>, T, "findUniqueOrThrow", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Find the first ComputedUpdateDeadLetter that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedUpdateDeadLetterFindFirstArgs} args - Arguments to find a ComputedUpdateDeadLetter
     * @example
     * // Get one ComputedUpdateDeadLetter
     * const computedUpdateDeadLetter = await prisma.computedUpdateDeadLetter.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends ComputedUpdateDeadLetterFindFirstArgs>(args?: SelectSubset<T, ComputedUpdateDeadLetterFindFirstArgs<ExtArgs>>): Prisma__ComputedUpdateDeadLetterClient<$Result.GetResult<Prisma.$ComputedUpdateDeadLetterPayload<ExtArgs>, T, "findFirst", ClientOptions> | null, null, ExtArgs, ClientOptions>

    /**
     * Find the first ComputedUpdateDeadLetter that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedUpdateDeadLetterFindFirstOrThrowArgs} args - Arguments to find a ComputedUpdateDeadLetter
     * @example
     * // Get one ComputedUpdateDeadLetter
     * const computedUpdateDeadLetter = await prisma.computedUpdateDeadLetter.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends ComputedUpdateDeadLetterFindFirstOrThrowArgs>(args?: SelectSubset<T, ComputedUpdateDeadLetterFindFirstOrThrowArgs<ExtArgs>>): Prisma__ComputedUpdateDeadLetterClient<$Result.GetResult<Prisma.$ComputedUpdateDeadLetterPayload<ExtArgs>, T, "findFirstOrThrow", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Find zero or more ComputedUpdateDeadLetters that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedUpdateDeadLetterFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all ComputedUpdateDeadLetters
     * const computedUpdateDeadLetters = await prisma.computedUpdateDeadLetter.findMany()
     * 
     * // Get first 10 ComputedUpdateDeadLetters
     * const computedUpdateDeadLetters = await prisma.computedUpdateDeadLetter.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const computedUpdateDeadLetterWithIdOnly = await prisma.computedUpdateDeadLetter.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends ComputedUpdateDeadLetterFindManyArgs>(args?: SelectSubset<T, ComputedUpdateDeadLetterFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ComputedUpdateDeadLetterPayload<ExtArgs>, T, "findMany", ClientOptions>>

    /**
     * Create a ComputedUpdateDeadLetter.
     * @param {ComputedUpdateDeadLetterCreateArgs} args - Arguments to create a ComputedUpdateDeadLetter.
     * @example
     * // Create one ComputedUpdateDeadLetter
     * const ComputedUpdateDeadLetter = await prisma.computedUpdateDeadLetter.create({
     *   data: {
     *     // ... data to create a ComputedUpdateDeadLetter
     *   }
     * })
     * 
     */
    create<T extends ComputedUpdateDeadLetterCreateArgs>(args: SelectSubset<T, ComputedUpdateDeadLetterCreateArgs<ExtArgs>>): Prisma__ComputedUpdateDeadLetterClient<$Result.GetResult<Prisma.$ComputedUpdateDeadLetterPayload<ExtArgs>, T, "create", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Create many ComputedUpdateDeadLetters.
     * @param {ComputedUpdateDeadLetterCreateManyArgs} args - Arguments to create many ComputedUpdateDeadLetters.
     * @example
     * // Create many ComputedUpdateDeadLetters
     * const computedUpdateDeadLetter = await prisma.computedUpdateDeadLetter.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends ComputedUpdateDeadLetterCreateManyArgs>(args?: SelectSubset<T, ComputedUpdateDeadLetterCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many ComputedUpdateDeadLetters and returns the data saved in the database.
     * @param {ComputedUpdateDeadLetterCreateManyAndReturnArgs} args - Arguments to create many ComputedUpdateDeadLetters.
     * @example
     * // Create many ComputedUpdateDeadLetters
     * const computedUpdateDeadLetter = await prisma.computedUpdateDeadLetter.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many ComputedUpdateDeadLetters and only return the `id`
     * const computedUpdateDeadLetterWithIdOnly = await prisma.computedUpdateDeadLetter.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends ComputedUpdateDeadLetterCreateManyAndReturnArgs>(args?: SelectSubset<T, ComputedUpdateDeadLetterCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ComputedUpdateDeadLetterPayload<ExtArgs>, T, "createManyAndReturn", ClientOptions>>

    /**
     * Delete a ComputedUpdateDeadLetter.
     * @param {ComputedUpdateDeadLetterDeleteArgs} args - Arguments to delete one ComputedUpdateDeadLetter.
     * @example
     * // Delete one ComputedUpdateDeadLetter
     * const ComputedUpdateDeadLetter = await prisma.computedUpdateDeadLetter.delete({
     *   where: {
     *     // ... filter to delete one ComputedUpdateDeadLetter
     *   }
     * })
     * 
     */
    delete<T extends ComputedUpdateDeadLetterDeleteArgs>(args: SelectSubset<T, ComputedUpdateDeadLetterDeleteArgs<ExtArgs>>): Prisma__ComputedUpdateDeadLetterClient<$Result.GetResult<Prisma.$ComputedUpdateDeadLetterPayload<ExtArgs>, T, "delete", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Update one ComputedUpdateDeadLetter.
     * @param {ComputedUpdateDeadLetterUpdateArgs} args - Arguments to update one ComputedUpdateDeadLetter.
     * @example
     * // Update one ComputedUpdateDeadLetter
     * const computedUpdateDeadLetter = await prisma.computedUpdateDeadLetter.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends ComputedUpdateDeadLetterUpdateArgs>(args: SelectSubset<T, ComputedUpdateDeadLetterUpdateArgs<ExtArgs>>): Prisma__ComputedUpdateDeadLetterClient<$Result.GetResult<Prisma.$ComputedUpdateDeadLetterPayload<ExtArgs>, T, "update", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Delete zero or more ComputedUpdateDeadLetters.
     * @param {ComputedUpdateDeadLetterDeleteManyArgs} args - Arguments to filter ComputedUpdateDeadLetters to delete.
     * @example
     * // Delete a few ComputedUpdateDeadLetters
     * const { count } = await prisma.computedUpdateDeadLetter.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends ComputedUpdateDeadLetterDeleteManyArgs>(args?: SelectSubset<T, ComputedUpdateDeadLetterDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more ComputedUpdateDeadLetters.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedUpdateDeadLetterUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many ComputedUpdateDeadLetters
     * const computedUpdateDeadLetter = await prisma.computedUpdateDeadLetter.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends ComputedUpdateDeadLetterUpdateManyArgs>(args: SelectSubset<T, ComputedUpdateDeadLetterUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more ComputedUpdateDeadLetters and returns the data updated in the database.
     * @param {ComputedUpdateDeadLetterUpdateManyAndReturnArgs} args - Arguments to update many ComputedUpdateDeadLetters.
     * @example
     * // Update many ComputedUpdateDeadLetters
     * const computedUpdateDeadLetter = await prisma.computedUpdateDeadLetter.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more ComputedUpdateDeadLetters and only return the `id`
     * const computedUpdateDeadLetterWithIdOnly = await prisma.computedUpdateDeadLetter.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends ComputedUpdateDeadLetterUpdateManyAndReturnArgs>(args: SelectSubset<T, ComputedUpdateDeadLetterUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ComputedUpdateDeadLetterPayload<ExtArgs>, T, "updateManyAndReturn", ClientOptions>>

    /**
     * Create or update one ComputedUpdateDeadLetter.
     * @param {ComputedUpdateDeadLetterUpsertArgs} args - Arguments to update or create a ComputedUpdateDeadLetter.
     * @example
     * // Update or create a ComputedUpdateDeadLetter
     * const computedUpdateDeadLetter = await prisma.computedUpdateDeadLetter.upsert({
     *   create: {
     *     // ... data to create a ComputedUpdateDeadLetter
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the ComputedUpdateDeadLetter we want to update
     *   }
     * })
     */
    upsert<T extends ComputedUpdateDeadLetterUpsertArgs>(args: SelectSubset<T, ComputedUpdateDeadLetterUpsertArgs<ExtArgs>>): Prisma__ComputedUpdateDeadLetterClient<$Result.GetResult<Prisma.$ComputedUpdateDeadLetterPayload<ExtArgs>, T, "upsert", ClientOptions>, never, ExtArgs, ClientOptions>


    /**
     * Count the number of ComputedUpdateDeadLetters.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedUpdateDeadLetterCountArgs} args - Arguments to filter ComputedUpdateDeadLetters to count.
     * @example
     * // Count the number of ComputedUpdateDeadLetters
     * const count = await prisma.computedUpdateDeadLetter.count({
     *   where: {
     *     // ... the filter for the ComputedUpdateDeadLetters we want to count
     *   }
     * })
    **/
    count<T extends ComputedUpdateDeadLetterCountArgs>(
      args?: Subset<T, ComputedUpdateDeadLetterCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], ComputedUpdateDeadLetterCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a ComputedUpdateDeadLetter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedUpdateDeadLetterAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends ComputedUpdateDeadLetterAggregateArgs>(args: Subset<T, ComputedUpdateDeadLetterAggregateArgs>): Prisma.PrismaPromise<GetComputedUpdateDeadLetterAggregateType<T>>

    /**
     * Group by ComputedUpdateDeadLetter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedUpdateDeadLetterGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends ComputedUpdateDeadLetterGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: ComputedUpdateDeadLetterGroupByArgs['orderBy'] }
        : { orderBy?: ComputedUpdateDeadLetterGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, ComputedUpdateDeadLetterGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetComputedUpdateDeadLetterGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the ComputedUpdateDeadLetter model
   */
  readonly fields: ComputedUpdateDeadLetterFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for ComputedUpdateDeadLetter.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__ComputedUpdateDeadLetterClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the ComputedUpdateDeadLetter model
   */ 
  interface ComputedUpdateDeadLetterFieldRefs {
    readonly id: FieldRef<"ComputedUpdateDeadLetter", 'String'>
    readonly baseId: FieldRef<"ComputedUpdateDeadLetter", 'String'>
    readonly seedTableId: FieldRef<"ComputedUpdateDeadLetter", 'String'>
    readonly seedRecordIds: FieldRef<"ComputedUpdateDeadLetter", 'Json'>
    readonly changeType: FieldRef<"ComputedUpdateDeadLetter", 'String'>
    readonly steps: FieldRef<"ComputedUpdateDeadLetter", 'Json'>
    readonly edges: FieldRef<"ComputedUpdateDeadLetter", 'Json'>
    readonly status: FieldRef<"ComputedUpdateDeadLetter", 'String'>
    readonly attempts: FieldRef<"ComputedUpdateDeadLetter", 'Int'>
    readonly maxAttempts: FieldRef<"ComputedUpdateDeadLetter", 'Int'>
    readonly nextRunAt: FieldRef<"ComputedUpdateDeadLetter", 'DateTime'>
    readonly lockedAt: FieldRef<"ComputedUpdateDeadLetter", 'DateTime'>
    readonly lockedBy: FieldRef<"ComputedUpdateDeadLetter", 'String'>
    readonly lastError: FieldRef<"ComputedUpdateDeadLetter", 'String'>
    readonly estimatedComplexity: FieldRef<"ComputedUpdateDeadLetter", 'Int'>
    readonly planHash: FieldRef<"ComputedUpdateDeadLetter", 'String'>
    readonly dirtyStats: FieldRef<"ComputedUpdateDeadLetter", 'Json'>
    readonly runId: FieldRef<"ComputedUpdateDeadLetter", 'String'>
    readonly originRunIds: FieldRef<"ComputedUpdateDeadLetter", 'String[]'>
    readonly runTotalSteps: FieldRef<"ComputedUpdateDeadLetter", 'Int'>
    readonly runCompletedStepsBefore: FieldRef<"ComputedUpdateDeadLetter", 'Int'>
    readonly affectedTableIds: FieldRef<"ComputedUpdateDeadLetter", 'String[]'>
    readonly affectedFieldIds: FieldRef<"ComputedUpdateDeadLetter", 'String[]'>
    readonly syncMaxLevel: FieldRef<"ComputedUpdateDeadLetter", 'Int'>
    readonly traceData: FieldRef<"ComputedUpdateDeadLetter", 'Json'>
    readonly failedAt: FieldRef<"ComputedUpdateDeadLetter", 'DateTime'>
    readonly createdAt: FieldRef<"ComputedUpdateDeadLetter", 'DateTime'>
    readonly updatedAt: FieldRef<"ComputedUpdateDeadLetter", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * ComputedUpdateDeadLetter findUnique
   */
  export type ComputedUpdateDeadLetterFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdateDeadLetter
     */
    select?: ComputedUpdateDeadLetterSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdateDeadLetter
     */
    omit?: ComputedUpdateDeadLetterOmit<ExtArgs> | null
    /**
     * Filter, which ComputedUpdateDeadLetter to fetch.
     */
    where: ComputedUpdateDeadLetterWhereUniqueInput
  }

  /**
   * ComputedUpdateDeadLetter findUniqueOrThrow
   */
  export type ComputedUpdateDeadLetterFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdateDeadLetter
     */
    select?: ComputedUpdateDeadLetterSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdateDeadLetter
     */
    omit?: ComputedUpdateDeadLetterOmit<ExtArgs> | null
    /**
     * Filter, which ComputedUpdateDeadLetter to fetch.
     */
    where: ComputedUpdateDeadLetterWhereUniqueInput
  }

  /**
   * ComputedUpdateDeadLetter findFirst
   */
  export type ComputedUpdateDeadLetterFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdateDeadLetter
     */
    select?: ComputedUpdateDeadLetterSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdateDeadLetter
     */
    omit?: ComputedUpdateDeadLetterOmit<ExtArgs> | null
    /**
     * Filter, which ComputedUpdateDeadLetter to fetch.
     */
    where?: ComputedUpdateDeadLetterWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ComputedUpdateDeadLetters to fetch.
     */
    orderBy?: ComputedUpdateDeadLetterOrderByWithRelationInput | ComputedUpdateDeadLetterOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for ComputedUpdateDeadLetters.
     */
    cursor?: ComputedUpdateDeadLetterWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ComputedUpdateDeadLetters from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ComputedUpdateDeadLetters.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of ComputedUpdateDeadLetters.
     */
    distinct?: ComputedUpdateDeadLetterScalarFieldEnum | ComputedUpdateDeadLetterScalarFieldEnum[]
  }

  /**
   * ComputedUpdateDeadLetter findFirstOrThrow
   */
  export type ComputedUpdateDeadLetterFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdateDeadLetter
     */
    select?: ComputedUpdateDeadLetterSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdateDeadLetter
     */
    omit?: ComputedUpdateDeadLetterOmit<ExtArgs> | null
    /**
     * Filter, which ComputedUpdateDeadLetter to fetch.
     */
    where?: ComputedUpdateDeadLetterWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ComputedUpdateDeadLetters to fetch.
     */
    orderBy?: ComputedUpdateDeadLetterOrderByWithRelationInput | ComputedUpdateDeadLetterOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for ComputedUpdateDeadLetters.
     */
    cursor?: ComputedUpdateDeadLetterWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ComputedUpdateDeadLetters from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ComputedUpdateDeadLetters.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of ComputedUpdateDeadLetters.
     */
    distinct?: ComputedUpdateDeadLetterScalarFieldEnum | ComputedUpdateDeadLetterScalarFieldEnum[]
  }

  /**
   * ComputedUpdateDeadLetter findMany
   */
  export type ComputedUpdateDeadLetterFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdateDeadLetter
     */
    select?: ComputedUpdateDeadLetterSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdateDeadLetter
     */
    omit?: ComputedUpdateDeadLetterOmit<ExtArgs> | null
    /**
     * Filter, which ComputedUpdateDeadLetters to fetch.
     */
    where?: ComputedUpdateDeadLetterWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ComputedUpdateDeadLetters to fetch.
     */
    orderBy?: ComputedUpdateDeadLetterOrderByWithRelationInput | ComputedUpdateDeadLetterOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing ComputedUpdateDeadLetters.
     */
    cursor?: ComputedUpdateDeadLetterWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ComputedUpdateDeadLetters from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ComputedUpdateDeadLetters.
     */
    skip?: number
    distinct?: ComputedUpdateDeadLetterScalarFieldEnum | ComputedUpdateDeadLetterScalarFieldEnum[]
  }

  /**
   * ComputedUpdateDeadLetter create
   */
  export type ComputedUpdateDeadLetterCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdateDeadLetter
     */
    select?: ComputedUpdateDeadLetterSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdateDeadLetter
     */
    omit?: ComputedUpdateDeadLetterOmit<ExtArgs> | null
    /**
     * The data needed to create a ComputedUpdateDeadLetter.
     */
    data: XOR<ComputedUpdateDeadLetterCreateInput, ComputedUpdateDeadLetterUncheckedCreateInput>
  }

  /**
   * ComputedUpdateDeadLetter createMany
   */
  export type ComputedUpdateDeadLetterCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many ComputedUpdateDeadLetters.
     */
    data: ComputedUpdateDeadLetterCreateManyInput | ComputedUpdateDeadLetterCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * ComputedUpdateDeadLetter createManyAndReturn
   */
  export type ComputedUpdateDeadLetterCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdateDeadLetter
     */
    select?: ComputedUpdateDeadLetterSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdateDeadLetter
     */
    omit?: ComputedUpdateDeadLetterOmit<ExtArgs> | null
    /**
     * The data used to create many ComputedUpdateDeadLetters.
     */
    data: ComputedUpdateDeadLetterCreateManyInput | ComputedUpdateDeadLetterCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * ComputedUpdateDeadLetter update
   */
  export type ComputedUpdateDeadLetterUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdateDeadLetter
     */
    select?: ComputedUpdateDeadLetterSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdateDeadLetter
     */
    omit?: ComputedUpdateDeadLetterOmit<ExtArgs> | null
    /**
     * The data needed to update a ComputedUpdateDeadLetter.
     */
    data: XOR<ComputedUpdateDeadLetterUpdateInput, ComputedUpdateDeadLetterUncheckedUpdateInput>
    /**
     * Choose, which ComputedUpdateDeadLetter to update.
     */
    where: ComputedUpdateDeadLetterWhereUniqueInput
  }

  /**
   * ComputedUpdateDeadLetter updateMany
   */
  export type ComputedUpdateDeadLetterUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update ComputedUpdateDeadLetters.
     */
    data: XOR<ComputedUpdateDeadLetterUpdateManyMutationInput, ComputedUpdateDeadLetterUncheckedUpdateManyInput>
    /**
     * Filter which ComputedUpdateDeadLetters to update
     */
    where?: ComputedUpdateDeadLetterWhereInput
  }

  /**
   * ComputedUpdateDeadLetter updateManyAndReturn
   */
  export type ComputedUpdateDeadLetterUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdateDeadLetter
     */
    select?: ComputedUpdateDeadLetterSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdateDeadLetter
     */
    omit?: ComputedUpdateDeadLetterOmit<ExtArgs> | null
    /**
     * The data used to update ComputedUpdateDeadLetters.
     */
    data: XOR<ComputedUpdateDeadLetterUpdateManyMutationInput, ComputedUpdateDeadLetterUncheckedUpdateManyInput>
    /**
     * Filter which ComputedUpdateDeadLetters to update
     */
    where?: ComputedUpdateDeadLetterWhereInput
  }

  /**
   * ComputedUpdateDeadLetter upsert
   */
  export type ComputedUpdateDeadLetterUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdateDeadLetter
     */
    select?: ComputedUpdateDeadLetterSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdateDeadLetter
     */
    omit?: ComputedUpdateDeadLetterOmit<ExtArgs> | null
    /**
     * The filter to search for the ComputedUpdateDeadLetter to update in case it exists.
     */
    where: ComputedUpdateDeadLetterWhereUniqueInput
    /**
     * In case the ComputedUpdateDeadLetter found by the `where` argument doesn't exist, create a new ComputedUpdateDeadLetter with this data.
     */
    create: XOR<ComputedUpdateDeadLetterCreateInput, ComputedUpdateDeadLetterUncheckedCreateInput>
    /**
     * In case the ComputedUpdateDeadLetter was found with the provided `where` argument, update it with this data.
     */
    update: XOR<ComputedUpdateDeadLetterUpdateInput, ComputedUpdateDeadLetterUncheckedUpdateInput>
  }

  /**
   * ComputedUpdateDeadLetter delete
   */
  export type ComputedUpdateDeadLetterDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdateDeadLetter
     */
    select?: ComputedUpdateDeadLetterSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdateDeadLetter
     */
    omit?: ComputedUpdateDeadLetterOmit<ExtArgs> | null
    /**
     * Filter which ComputedUpdateDeadLetter to delete.
     */
    where: ComputedUpdateDeadLetterWhereUniqueInput
  }

  /**
   * ComputedUpdateDeadLetter deleteMany
   */
  export type ComputedUpdateDeadLetterDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which ComputedUpdateDeadLetters to delete
     */
    where?: ComputedUpdateDeadLetterWhereInput
  }

  /**
   * ComputedUpdateDeadLetter without action
   */
  export type ComputedUpdateDeadLetterDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdateDeadLetter
     */
    select?: ComputedUpdateDeadLetterSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdateDeadLetter
     */
    omit?: ComputedUpdateDeadLetterOmit<ExtArgs> | null
  }


  /**
   * Model ComputedUpdatePauseScope
   */

  export type AggregateComputedUpdatePauseScope = {
    _count: ComputedUpdatePauseScopeCountAggregateOutputType | null
    _min: ComputedUpdatePauseScopeMinAggregateOutputType | null
    _max: ComputedUpdatePauseScopeMaxAggregateOutputType | null
  }

  export type ComputedUpdatePauseScopeMinAggregateOutputType = {
    id: string | null
    scopeType: string | null
    scopeId: string | null
    pausedAt: Date | null
    pausedBy: string | null
    resumeAt: Date | null
    reason: string | null
    updatedAt: Date | null
    updatedBy: string | null
  }

  export type ComputedUpdatePauseScopeMaxAggregateOutputType = {
    id: string | null
    scopeType: string | null
    scopeId: string | null
    pausedAt: Date | null
    pausedBy: string | null
    resumeAt: Date | null
    reason: string | null
    updatedAt: Date | null
    updatedBy: string | null
  }

  export type ComputedUpdatePauseScopeCountAggregateOutputType = {
    id: number
    scopeType: number
    scopeId: number
    pausedAt: number
    pausedBy: number
    resumeAt: number
    reason: number
    updatedAt: number
    updatedBy: number
    _all: number
  }


  export type ComputedUpdatePauseScopeMinAggregateInputType = {
    id?: true
    scopeType?: true
    scopeId?: true
    pausedAt?: true
    pausedBy?: true
    resumeAt?: true
    reason?: true
    updatedAt?: true
    updatedBy?: true
  }

  export type ComputedUpdatePauseScopeMaxAggregateInputType = {
    id?: true
    scopeType?: true
    scopeId?: true
    pausedAt?: true
    pausedBy?: true
    resumeAt?: true
    reason?: true
    updatedAt?: true
    updatedBy?: true
  }

  export type ComputedUpdatePauseScopeCountAggregateInputType = {
    id?: true
    scopeType?: true
    scopeId?: true
    pausedAt?: true
    pausedBy?: true
    resumeAt?: true
    reason?: true
    updatedAt?: true
    updatedBy?: true
    _all?: true
  }

  export type ComputedUpdatePauseScopeAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which ComputedUpdatePauseScope to aggregate.
     */
    where?: ComputedUpdatePauseScopeWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ComputedUpdatePauseScopes to fetch.
     */
    orderBy?: ComputedUpdatePauseScopeOrderByWithRelationInput | ComputedUpdatePauseScopeOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: ComputedUpdatePauseScopeWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ComputedUpdatePauseScopes from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ComputedUpdatePauseScopes.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned ComputedUpdatePauseScopes
    **/
    _count?: true | ComputedUpdatePauseScopeCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: ComputedUpdatePauseScopeMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: ComputedUpdatePauseScopeMaxAggregateInputType
  }

  export type GetComputedUpdatePauseScopeAggregateType<T extends ComputedUpdatePauseScopeAggregateArgs> = {
        [P in keyof T & keyof AggregateComputedUpdatePauseScope]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateComputedUpdatePauseScope[P]>
      : GetScalarType<T[P], AggregateComputedUpdatePauseScope[P]>
  }




  export type ComputedUpdatePauseScopeGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ComputedUpdatePauseScopeWhereInput
    orderBy?: ComputedUpdatePauseScopeOrderByWithAggregationInput | ComputedUpdatePauseScopeOrderByWithAggregationInput[]
    by: ComputedUpdatePauseScopeScalarFieldEnum[] | ComputedUpdatePauseScopeScalarFieldEnum
    having?: ComputedUpdatePauseScopeScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: ComputedUpdatePauseScopeCountAggregateInputType | true
    _min?: ComputedUpdatePauseScopeMinAggregateInputType
    _max?: ComputedUpdatePauseScopeMaxAggregateInputType
  }

  export type ComputedUpdatePauseScopeGroupByOutputType = {
    id: string
    scopeType: string
    scopeId: string
    pausedAt: Date
    pausedBy: string | null
    resumeAt: Date | null
    reason: string | null
    updatedAt: Date
    updatedBy: string | null
    _count: ComputedUpdatePauseScopeCountAggregateOutputType | null
    _min: ComputedUpdatePauseScopeMinAggregateOutputType | null
    _max: ComputedUpdatePauseScopeMaxAggregateOutputType | null
  }

  type GetComputedUpdatePauseScopeGroupByPayload<T extends ComputedUpdatePauseScopeGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<ComputedUpdatePauseScopeGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof ComputedUpdatePauseScopeGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], ComputedUpdatePauseScopeGroupByOutputType[P]>
            : GetScalarType<T[P], ComputedUpdatePauseScopeGroupByOutputType[P]>
        }
      >
    >


  export type ComputedUpdatePauseScopeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    scopeType?: boolean
    scopeId?: boolean
    pausedAt?: boolean
    pausedBy?: boolean
    resumeAt?: boolean
    reason?: boolean
    updatedAt?: boolean
    updatedBy?: boolean
  }, ExtArgs["result"]["computedUpdatePauseScope"]>

  export type ComputedUpdatePauseScopeSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    scopeType?: boolean
    scopeId?: boolean
    pausedAt?: boolean
    pausedBy?: boolean
    resumeAt?: boolean
    reason?: boolean
    updatedAt?: boolean
    updatedBy?: boolean
  }, ExtArgs["result"]["computedUpdatePauseScope"]>

  export type ComputedUpdatePauseScopeSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    scopeType?: boolean
    scopeId?: boolean
    pausedAt?: boolean
    pausedBy?: boolean
    resumeAt?: boolean
    reason?: boolean
    updatedAt?: boolean
    updatedBy?: boolean
  }, ExtArgs["result"]["computedUpdatePauseScope"]>

  export type ComputedUpdatePauseScopeSelectScalar = {
    id?: boolean
    scopeType?: boolean
    scopeId?: boolean
    pausedAt?: boolean
    pausedBy?: boolean
    resumeAt?: boolean
    reason?: boolean
    updatedAt?: boolean
    updatedBy?: boolean
  }

  export type ComputedUpdatePauseScopeOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "scopeType" | "scopeId" | "pausedAt" | "pausedBy" | "resumeAt" | "reason" | "updatedAt" | "updatedBy", ExtArgs["result"]["computedUpdatePauseScope"]>

  export type $ComputedUpdatePauseScopePayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "ComputedUpdatePauseScope"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      scopeType: string
      scopeId: string
      pausedAt: Date
      pausedBy: string | null
      resumeAt: Date | null
      reason: string | null
      updatedAt: Date
      updatedBy: string | null
    }, ExtArgs["result"]["computedUpdatePauseScope"]>
    composites: {}
  }

  type ComputedUpdatePauseScopeGetPayload<S extends boolean | null | undefined | ComputedUpdatePauseScopeDefaultArgs> = $Result.GetResult<Prisma.$ComputedUpdatePauseScopePayload, S>

  type ComputedUpdatePauseScopeCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<ComputedUpdatePauseScopeFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: ComputedUpdatePauseScopeCountAggregateInputType | true
    }

  export interface ComputedUpdatePauseScopeDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['ComputedUpdatePauseScope'], meta: { name: 'ComputedUpdatePauseScope' } }
    /**
     * Find zero or one ComputedUpdatePauseScope that matches the filter.
     * @param {ComputedUpdatePauseScopeFindUniqueArgs} args - Arguments to find a ComputedUpdatePauseScope
     * @example
     * // Get one ComputedUpdatePauseScope
     * const computedUpdatePauseScope = await prisma.computedUpdatePauseScope.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends ComputedUpdatePauseScopeFindUniqueArgs>(args: SelectSubset<T, ComputedUpdatePauseScopeFindUniqueArgs<ExtArgs>>): Prisma__ComputedUpdatePauseScopeClient<$Result.GetResult<Prisma.$ComputedUpdatePauseScopePayload<ExtArgs>, T, "findUnique", ClientOptions> | null, null, ExtArgs, ClientOptions>

    /**
     * Find one ComputedUpdatePauseScope that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {ComputedUpdatePauseScopeFindUniqueOrThrowArgs} args - Arguments to find a ComputedUpdatePauseScope
     * @example
     * // Get one ComputedUpdatePauseScope
     * const computedUpdatePauseScope = await prisma.computedUpdatePauseScope.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends ComputedUpdatePauseScopeFindUniqueOrThrowArgs>(args: SelectSubset<T, ComputedUpdatePauseScopeFindUniqueOrThrowArgs<ExtArgs>>): Prisma__ComputedUpdatePauseScopeClient<$Result.GetResult<Prisma.$ComputedUpdatePauseScopePayload<ExtArgs>, T, "findUniqueOrThrow", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Find the first ComputedUpdatePauseScope that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedUpdatePauseScopeFindFirstArgs} args - Arguments to find a ComputedUpdatePauseScope
     * @example
     * // Get one ComputedUpdatePauseScope
     * const computedUpdatePauseScope = await prisma.computedUpdatePauseScope.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends ComputedUpdatePauseScopeFindFirstArgs>(args?: SelectSubset<T, ComputedUpdatePauseScopeFindFirstArgs<ExtArgs>>): Prisma__ComputedUpdatePauseScopeClient<$Result.GetResult<Prisma.$ComputedUpdatePauseScopePayload<ExtArgs>, T, "findFirst", ClientOptions> | null, null, ExtArgs, ClientOptions>

    /**
     * Find the first ComputedUpdatePauseScope that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedUpdatePauseScopeFindFirstOrThrowArgs} args - Arguments to find a ComputedUpdatePauseScope
     * @example
     * // Get one ComputedUpdatePauseScope
     * const computedUpdatePauseScope = await prisma.computedUpdatePauseScope.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends ComputedUpdatePauseScopeFindFirstOrThrowArgs>(args?: SelectSubset<T, ComputedUpdatePauseScopeFindFirstOrThrowArgs<ExtArgs>>): Prisma__ComputedUpdatePauseScopeClient<$Result.GetResult<Prisma.$ComputedUpdatePauseScopePayload<ExtArgs>, T, "findFirstOrThrow", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Find zero or more ComputedUpdatePauseScopes that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedUpdatePauseScopeFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all ComputedUpdatePauseScopes
     * const computedUpdatePauseScopes = await prisma.computedUpdatePauseScope.findMany()
     * 
     * // Get first 10 ComputedUpdatePauseScopes
     * const computedUpdatePauseScopes = await prisma.computedUpdatePauseScope.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const computedUpdatePauseScopeWithIdOnly = await prisma.computedUpdatePauseScope.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends ComputedUpdatePauseScopeFindManyArgs>(args?: SelectSubset<T, ComputedUpdatePauseScopeFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ComputedUpdatePauseScopePayload<ExtArgs>, T, "findMany", ClientOptions>>

    /**
     * Create a ComputedUpdatePauseScope.
     * @param {ComputedUpdatePauseScopeCreateArgs} args - Arguments to create a ComputedUpdatePauseScope.
     * @example
     * // Create one ComputedUpdatePauseScope
     * const ComputedUpdatePauseScope = await prisma.computedUpdatePauseScope.create({
     *   data: {
     *     // ... data to create a ComputedUpdatePauseScope
     *   }
     * })
     * 
     */
    create<T extends ComputedUpdatePauseScopeCreateArgs>(args: SelectSubset<T, ComputedUpdatePauseScopeCreateArgs<ExtArgs>>): Prisma__ComputedUpdatePauseScopeClient<$Result.GetResult<Prisma.$ComputedUpdatePauseScopePayload<ExtArgs>, T, "create", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Create many ComputedUpdatePauseScopes.
     * @param {ComputedUpdatePauseScopeCreateManyArgs} args - Arguments to create many ComputedUpdatePauseScopes.
     * @example
     * // Create many ComputedUpdatePauseScopes
     * const computedUpdatePauseScope = await prisma.computedUpdatePauseScope.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends ComputedUpdatePauseScopeCreateManyArgs>(args?: SelectSubset<T, ComputedUpdatePauseScopeCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many ComputedUpdatePauseScopes and returns the data saved in the database.
     * @param {ComputedUpdatePauseScopeCreateManyAndReturnArgs} args - Arguments to create many ComputedUpdatePauseScopes.
     * @example
     * // Create many ComputedUpdatePauseScopes
     * const computedUpdatePauseScope = await prisma.computedUpdatePauseScope.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many ComputedUpdatePauseScopes and only return the `id`
     * const computedUpdatePauseScopeWithIdOnly = await prisma.computedUpdatePauseScope.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends ComputedUpdatePauseScopeCreateManyAndReturnArgs>(args?: SelectSubset<T, ComputedUpdatePauseScopeCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ComputedUpdatePauseScopePayload<ExtArgs>, T, "createManyAndReturn", ClientOptions>>

    /**
     * Delete a ComputedUpdatePauseScope.
     * @param {ComputedUpdatePauseScopeDeleteArgs} args - Arguments to delete one ComputedUpdatePauseScope.
     * @example
     * // Delete one ComputedUpdatePauseScope
     * const ComputedUpdatePauseScope = await prisma.computedUpdatePauseScope.delete({
     *   where: {
     *     // ... filter to delete one ComputedUpdatePauseScope
     *   }
     * })
     * 
     */
    delete<T extends ComputedUpdatePauseScopeDeleteArgs>(args: SelectSubset<T, ComputedUpdatePauseScopeDeleteArgs<ExtArgs>>): Prisma__ComputedUpdatePauseScopeClient<$Result.GetResult<Prisma.$ComputedUpdatePauseScopePayload<ExtArgs>, T, "delete", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Update one ComputedUpdatePauseScope.
     * @param {ComputedUpdatePauseScopeUpdateArgs} args - Arguments to update one ComputedUpdatePauseScope.
     * @example
     * // Update one ComputedUpdatePauseScope
     * const computedUpdatePauseScope = await prisma.computedUpdatePauseScope.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends ComputedUpdatePauseScopeUpdateArgs>(args: SelectSubset<T, ComputedUpdatePauseScopeUpdateArgs<ExtArgs>>): Prisma__ComputedUpdatePauseScopeClient<$Result.GetResult<Prisma.$ComputedUpdatePauseScopePayload<ExtArgs>, T, "update", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Delete zero or more ComputedUpdatePauseScopes.
     * @param {ComputedUpdatePauseScopeDeleteManyArgs} args - Arguments to filter ComputedUpdatePauseScopes to delete.
     * @example
     * // Delete a few ComputedUpdatePauseScopes
     * const { count } = await prisma.computedUpdatePauseScope.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends ComputedUpdatePauseScopeDeleteManyArgs>(args?: SelectSubset<T, ComputedUpdatePauseScopeDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more ComputedUpdatePauseScopes.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedUpdatePauseScopeUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many ComputedUpdatePauseScopes
     * const computedUpdatePauseScope = await prisma.computedUpdatePauseScope.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends ComputedUpdatePauseScopeUpdateManyArgs>(args: SelectSubset<T, ComputedUpdatePauseScopeUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more ComputedUpdatePauseScopes and returns the data updated in the database.
     * @param {ComputedUpdatePauseScopeUpdateManyAndReturnArgs} args - Arguments to update many ComputedUpdatePauseScopes.
     * @example
     * // Update many ComputedUpdatePauseScopes
     * const computedUpdatePauseScope = await prisma.computedUpdatePauseScope.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more ComputedUpdatePauseScopes and only return the `id`
     * const computedUpdatePauseScopeWithIdOnly = await prisma.computedUpdatePauseScope.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends ComputedUpdatePauseScopeUpdateManyAndReturnArgs>(args: SelectSubset<T, ComputedUpdatePauseScopeUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ComputedUpdatePauseScopePayload<ExtArgs>, T, "updateManyAndReturn", ClientOptions>>

    /**
     * Create or update one ComputedUpdatePauseScope.
     * @param {ComputedUpdatePauseScopeUpsertArgs} args - Arguments to update or create a ComputedUpdatePauseScope.
     * @example
     * // Update or create a ComputedUpdatePauseScope
     * const computedUpdatePauseScope = await prisma.computedUpdatePauseScope.upsert({
     *   create: {
     *     // ... data to create a ComputedUpdatePauseScope
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the ComputedUpdatePauseScope we want to update
     *   }
     * })
     */
    upsert<T extends ComputedUpdatePauseScopeUpsertArgs>(args: SelectSubset<T, ComputedUpdatePauseScopeUpsertArgs<ExtArgs>>): Prisma__ComputedUpdatePauseScopeClient<$Result.GetResult<Prisma.$ComputedUpdatePauseScopePayload<ExtArgs>, T, "upsert", ClientOptions>, never, ExtArgs, ClientOptions>


    /**
     * Count the number of ComputedUpdatePauseScopes.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedUpdatePauseScopeCountArgs} args - Arguments to filter ComputedUpdatePauseScopes to count.
     * @example
     * // Count the number of ComputedUpdatePauseScopes
     * const count = await prisma.computedUpdatePauseScope.count({
     *   where: {
     *     // ... the filter for the ComputedUpdatePauseScopes we want to count
     *   }
     * })
    **/
    count<T extends ComputedUpdatePauseScopeCountArgs>(
      args?: Subset<T, ComputedUpdatePauseScopeCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], ComputedUpdatePauseScopeCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a ComputedUpdatePauseScope.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedUpdatePauseScopeAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends ComputedUpdatePauseScopeAggregateArgs>(args: Subset<T, ComputedUpdatePauseScopeAggregateArgs>): Prisma.PrismaPromise<GetComputedUpdatePauseScopeAggregateType<T>>

    /**
     * Group by ComputedUpdatePauseScope.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedUpdatePauseScopeGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends ComputedUpdatePauseScopeGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: ComputedUpdatePauseScopeGroupByArgs['orderBy'] }
        : { orderBy?: ComputedUpdatePauseScopeGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, ComputedUpdatePauseScopeGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetComputedUpdatePauseScopeGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the ComputedUpdatePauseScope model
   */
  readonly fields: ComputedUpdatePauseScopeFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for ComputedUpdatePauseScope.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__ComputedUpdatePauseScopeClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the ComputedUpdatePauseScope model
   */ 
  interface ComputedUpdatePauseScopeFieldRefs {
    readonly id: FieldRef<"ComputedUpdatePauseScope", 'String'>
    readonly scopeType: FieldRef<"ComputedUpdatePauseScope", 'String'>
    readonly scopeId: FieldRef<"ComputedUpdatePauseScope", 'String'>
    readonly pausedAt: FieldRef<"ComputedUpdatePauseScope", 'DateTime'>
    readonly pausedBy: FieldRef<"ComputedUpdatePauseScope", 'String'>
    readonly resumeAt: FieldRef<"ComputedUpdatePauseScope", 'DateTime'>
    readonly reason: FieldRef<"ComputedUpdatePauseScope", 'String'>
    readonly updatedAt: FieldRef<"ComputedUpdatePauseScope", 'DateTime'>
    readonly updatedBy: FieldRef<"ComputedUpdatePauseScope", 'String'>
  }
    

  // Custom InputTypes
  /**
   * ComputedUpdatePauseScope findUnique
   */
  export type ComputedUpdatePauseScopeFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdatePauseScope
     */
    select?: ComputedUpdatePauseScopeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdatePauseScope
     */
    omit?: ComputedUpdatePauseScopeOmit<ExtArgs> | null
    /**
     * Filter, which ComputedUpdatePauseScope to fetch.
     */
    where: ComputedUpdatePauseScopeWhereUniqueInput
  }

  /**
   * ComputedUpdatePauseScope findUniqueOrThrow
   */
  export type ComputedUpdatePauseScopeFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdatePauseScope
     */
    select?: ComputedUpdatePauseScopeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdatePauseScope
     */
    omit?: ComputedUpdatePauseScopeOmit<ExtArgs> | null
    /**
     * Filter, which ComputedUpdatePauseScope to fetch.
     */
    where: ComputedUpdatePauseScopeWhereUniqueInput
  }

  /**
   * ComputedUpdatePauseScope findFirst
   */
  export type ComputedUpdatePauseScopeFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdatePauseScope
     */
    select?: ComputedUpdatePauseScopeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdatePauseScope
     */
    omit?: ComputedUpdatePauseScopeOmit<ExtArgs> | null
    /**
     * Filter, which ComputedUpdatePauseScope to fetch.
     */
    where?: ComputedUpdatePauseScopeWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ComputedUpdatePauseScopes to fetch.
     */
    orderBy?: ComputedUpdatePauseScopeOrderByWithRelationInput | ComputedUpdatePauseScopeOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for ComputedUpdatePauseScopes.
     */
    cursor?: ComputedUpdatePauseScopeWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ComputedUpdatePauseScopes from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ComputedUpdatePauseScopes.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of ComputedUpdatePauseScopes.
     */
    distinct?: ComputedUpdatePauseScopeScalarFieldEnum | ComputedUpdatePauseScopeScalarFieldEnum[]
  }

  /**
   * ComputedUpdatePauseScope findFirstOrThrow
   */
  export type ComputedUpdatePauseScopeFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdatePauseScope
     */
    select?: ComputedUpdatePauseScopeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdatePauseScope
     */
    omit?: ComputedUpdatePauseScopeOmit<ExtArgs> | null
    /**
     * Filter, which ComputedUpdatePauseScope to fetch.
     */
    where?: ComputedUpdatePauseScopeWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ComputedUpdatePauseScopes to fetch.
     */
    orderBy?: ComputedUpdatePauseScopeOrderByWithRelationInput | ComputedUpdatePauseScopeOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for ComputedUpdatePauseScopes.
     */
    cursor?: ComputedUpdatePauseScopeWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ComputedUpdatePauseScopes from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ComputedUpdatePauseScopes.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of ComputedUpdatePauseScopes.
     */
    distinct?: ComputedUpdatePauseScopeScalarFieldEnum | ComputedUpdatePauseScopeScalarFieldEnum[]
  }

  /**
   * ComputedUpdatePauseScope findMany
   */
  export type ComputedUpdatePauseScopeFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdatePauseScope
     */
    select?: ComputedUpdatePauseScopeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdatePauseScope
     */
    omit?: ComputedUpdatePauseScopeOmit<ExtArgs> | null
    /**
     * Filter, which ComputedUpdatePauseScopes to fetch.
     */
    where?: ComputedUpdatePauseScopeWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ComputedUpdatePauseScopes to fetch.
     */
    orderBy?: ComputedUpdatePauseScopeOrderByWithRelationInput | ComputedUpdatePauseScopeOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing ComputedUpdatePauseScopes.
     */
    cursor?: ComputedUpdatePauseScopeWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ComputedUpdatePauseScopes from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ComputedUpdatePauseScopes.
     */
    skip?: number
    distinct?: ComputedUpdatePauseScopeScalarFieldEnum | ComputedUpdatePauseScopeScalarFieldEnum[]
  }

  /**
   * ComputedUpdatePauseScope create
   */
  export type ComputedUpdatePauseScopeCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdatePauseScope
     */
    select?: ComputedUpdatePauseScopeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdatePauseScope
     */
    omit?: ComputedUpdatePauseScopeOmit<ExtArgs> | null
    /**
     * The data needed to create a ComputedUpdatePauseScope.
     */
    data: XOR<ComputedUpdatePauseScopeCreateInput, ComputedUpdatePauseScopeUncheckedCreateInput>
  }

  /**
   * ComputedUpdatePauseScope createMany
   */
  export type ComputedUpdatePauseScopeCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many ComputedUpdatePauseScopes.
     */
    data: ComputedUpdatePauseScopeCreateManyInput | ComputedUpdatePauseScopeCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * ComputedUpdatePauseScope createManyAndReturn
   */
  export type ComputedUpdatePauseScopeCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdatePauseScope
     */
    select?: ComputedUpdatePauseScopeSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdatePauseScope
     */
    omit?: ComputedUpdatePauseScopeOmit<ExtArgs> | null
    /**
     * The data used to create many ComputedUpdatePauseScopes.
     */
    data: ComputedUpdatePauseScopeCreateManyInput | ComputedUpdatePauseScopeCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * ComputedUpdatePauseScope update
   */
  export type ComputedUpdatePauseScopeUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdatePauseScope
     */
    select?: ComputedUpdatePauseScopeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdatePauseScope
     */
    omit?: ComputedUpdatePauseScopeOmit<ExtArgs> | null
    /**
     * The data needed to update a ComputedUpdatePauseScope.
     */
    data: XOR<ComputedUpdatePauseScopeUpdateInput, ComputedUpdatePauseScopeUncheckedUpdateInput>
    /**
     * Choose, which ComputedUpdatePauseScope to update.
     */
    where: ComputedUpdatePauseScopeWhereUniqueInput
  }

  /**
   * ComputedUpdatePauseScope updateMany
   */
  export type ComputedUpdatePauseScopeUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update ComputedUpdatePauseScopes.
     */
    data: XOR<ComputedUpdatePauseScopeUpdateManyMutationInput, ComputedUpdatePauseScopeUncheckedUpdateManyInput>
    /**
     * Filter which ComputedUpdatePauseScopes to update
     */
    where?: ComputedUpdatePauseScopeWhereInput
  }

  /**
   * ComputedUpdatePauseScope updateManyAndReturn
   */
  export type ComputedUpdatePauseScopeUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdatePauseScope
     */
    select?: ComputedUpdatePauseScopeSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdatePauseScope
     */
    omit?: ComputedUpdatePauseScopeOmit<ExtArgs> | null
    /**
     * The data used to update ComputedUpdatePauseScopes.
     */
    data: XOR<ComputedUpdatePauseScopeUpdateManyMutationInput, ComputedUpdatePauseScopeUncheckedUpdateManyInput>
    /**
     * Filter which ComputedUpdatePauseScopes to update
     */
    where?: ComputedUpdatePauseScopeWhereInput
  }

  /**
   * ComputedUpdatePauseScope upsert
   */
  export type ComputedUpdatePauseScopeUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdatePauseScope
     */
    select?: ComputedUpdatePauseScopeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdatePauseScope
     */
    omit?: ComputedUpdatePauseScopeOmit<ExtArgs> | null
    /**
     * The filter to search for the ComputedUpdatePauseScope to update in case it exists.
     */
    where: ComputedUpdatePauseScopeWhereUniqueInput
    /**
     * In case the ComputedUpdatePauseScope found by the `where` argument doesn't exist, create a new ComputedUpdatePauseScope with this data.
     */
    create: XOR<ComputedUpdatePauseScopeCreateInput, ComputedUpdatePauseScopeUncheckedCreateInput>
    /**
     * In case the ComputedUpdatePauseScope was found with the provided `where` argument, update it with this data.
     */
    update: XOR<ComputedUpdatePauseScopeUpdateInput, ComputedUpdatePauseScopeUncheckedUpdateInput>
  }

  /**
   * ComputedUpdatePauseScope delete
   */
  export type ComputedUpdatePauseScopeDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdatePauseScope
     */
    select?: ComputedUpdatePauseScopeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdatePauseScope
     */
    omit?: ComputedUpdatePauseScopeOmit<ExtArgs> | null
    /**
     * Filter which ComputedUpdatePauseScope to delete.
     */
    where: ComputedUpdatePauseScopeWhereUniqueInput
  }

  /**
   * ComputedUpdatePauseScope deleteMany
   */
  export type ComputedUpdatePauseScopeDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which ComputedUpdatePauseScopes to delete
     */
    where?: ComputedUpdatePauseScopeWhereInput
  }

  /**
   * ComputedUpdatePauseScope without action
   */
  export type ComputedUpdatePauseScopeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedUpdatePauseScope
     */
    select?: ComputedUpdatePauseScopeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedUpdatePauseScope
     */
    omit?: ComputedUpdatePauseScopeOmit<ExtArgs> | null
  }


  /**
   * Model ComputedFieldActivity
   */

  export type AggregateComputedFieldActivity = {
    _count: ComputedFieldActivityCountAggregateOutputType | null
    _avg: ComputedFieldActivityAvgAggregateOutputType | null
    _sum: ComputedFieldActivitySumAggregateOutputType | null
    _min: ComputedFieldActivityMinAggregateOutputType | null
    _max: ComputedFieldActivityMaxAggregateOutputType | null
  }

  export type ComputedFieldActivityAvgAggregateOutputType = {
    activeTaskCount: number | null
    processingTaskCount: number | null
    generation: number | null
    estimatedComplexity: number | null
    estimatedDirtyRecords: number | null
    lastDurationMs: number | null
  }

  export type ComputedFieldActivitySumAggregateOutputType = {
    activeTaskCount: number | null
    processingTaskCount: number | null
    generation: bigint | null
    estimatedComplexity: bigint | null
    estimatedDirtyRecords: bigint | null
    lastDurationMs: number | null
  }

  export type ComputedFieldActivityMinAggregateOutputType = {
    fieldId: string | null
    tableId: string | null
    baseId: string | null
    status: string | null
    activeTaskCount: number | null
    processingTaskCount: number | null
    generation: bigint | null
    estimatedComplexity: bigint | null
    estimatedDirtyRecords: bigint | null
    hasAllTargetRecords: boolean | null
    queuedAt: Date | null
    startedAt: Date | null
    lastCompletedAt: Date | null
    lastDurationMs: number | null
    updatedAt: Date | null
  }

  export type ComputedFieldActivityMaxAggregateOutputType = {
    fieldId: string | null
    tableId: string | null
    baseId: string | null
    status: string | null
    activeTaskCount: number | null
    processingTaskCount: number | null
    generation: bigint | null
    estimatedComplexity: bigint | null
    estimatedDirtyRecords: bigint | null
    hasAllTargetRecords: boolean | null
    queuedAt: Date | null
    startedAt: Date | null
    lastCompletedAt: Date | null
    lastDurationMs: number | null
    updatedAt: Date | null
  }

  export type ComputedFieldActivityCountAggregateOutputType = {
    fieldId: number
    tableId: number
    baseId: number
    status: number
    activeTaskCount: number
    processingTaskCount: number
    generation: number
    estimatedComplexity: number
    estimatedDirtyRecords: number
    hasAllTargetRecords: number
    queuedAt: number
    startedAt: number
    lastCompletedAt: number
    lastDurationMs: number
    lastError: number
    extensions: number
    updatedAt: number
    _all: number
  }


  export type ComputedFieldActivityAvgAggregateInputType = {
    activeTaskCount?: true
    processingTaskCount?: true
    generation?: true
    estimatedComplexity?: true
    estimatedDirtyRecords?: true
    lastDurationMs?: true
  }

  export type ComputedFieldActivitySumAggregateInputType = {
    activeTaskCount?: true
    processingTaskCount?: true
    generation?: true
    estimatedComplexity?: true
    estimatedDirtyRecords?: true
    lastDurationMs?: true
  }

  export type ComputedFieldActivityMinAggregateInputType = {
    fieldId?: true
    tableId?: true
    baseId?: true
    status?: true
    activeTaskCount?: true
    processingTaskCount?: true
    generation?: true
    estimatedComplexity?: true
    estimatedDirtyRecords?: true
    hasAllTargetRecords?: true
    queuedAt?: true
    startedAt?: true
    lastCompletedAt?: true
    lastDurationMs?: true
    updatedAt?: true
  }

  export type ComputedFieldActivityMaxAggregateInputType = {
    fieldId?: true
    tableId?: true
    baseId?: true
    status?: true
    activeTaskCount?: true
    processingTaskCount?: true
    generation?: true
    estimatedComplexity?: true
    estimatedDirtyRecords?: true
    hasAllTargetRecords?: true
    queuedAt?: true
    startedAt?: true
    lastCompletedAt?: true
    lastDurationMs?: true
    updatedAt?: true
  }

  export type ComputedFieldActivityCountAggregateInputType = {
    fieldId?: true
    tableId?: true
    baseId?: true
    status?: true
    activeTaskCount?: true
    processingTaskCount?: true
    generation?: true
    estimatedComplexity?: true
    estimatedDirtyRecords?: true
    hasAllTargetRecords?: true
    queuedAt?: true
    startedAt?: true
    lastCompletedAt?: true
    lastDurationMs?: true
    lastError?: true
    extensions?: true
    updatedAt?: true
    _all?: true
  }

  export type ComputedFieldActivityAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which ComputedFieldActivity to aggregate.
     */
    where?: ComputedFieldActivityWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ComputedFieldActivities to fetch.
     */
    orderBy?: ComputedFieldActivityOrderByWithRelationInput | ComputedFieldActivityOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: ComputedFieldActivityWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ComputedFieldActivities from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ComputedFieldActivities.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned ComputedFieldActivities
    **/
    _count?: true | ComputedFieldActivityCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: ComputedFieldActivityAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: ComputedFieldActivitySumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: ComputedFieldActivityMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: ComputedFieldActivityMaxAggregateInputType
  }

  export type GetComputedFieldActivityAggregateType<T extends ComputedFieldActivityAggregateArgs> = {
        [P in keyof T & keyof AggregateComputedFieldActivity]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateComputedFieldActivity[P]>
      : GetScalarType<T[P], AggregateComputedFieldActivity[P]>
  }




  export type ComputedFieldActivityGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ComputedFieldActivityWhereInput
    orderBy?: ComputedFieldActivityOrderByWithAggregationInput | ComputedFieldActivityOrderByWithAggregationInput[]
    by: ComputedFieldActivityScalarFieldEnum[] | ComputedFieldActivityScalarFieldEnum
    having?: ComputedFieldActivityScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: ComputedFieldActivityCountAggregateInputType | true
    _avg?: ComputedFieldActivityAvgAggregateInputType
    _sum?: ComputedFieldActivitySumAggregateInputType
    _min?: ComputedFieldActivityMinAggregateInputType
    _max?: ComputedFieldActivityMaxAggregateInputType
  }

  export type ComputedFieldActivityGroupByOutputType = {
    fieldId: string
    tableId: string
    baseId: string
    status: string
    activeTaskCount: number
    processingTaskCount: number
    generation: bigint
    estimatedComplexity: bigint
    estimatedDirtyRecords: bigint
    hasAllTargetRecords: boolean
    queuedAt: Date | null
    startedAt: Date | null
    lastCompletedAt: Date | null
    lastDurationMs: number | null
    lastError: JsonValue | null
    extensions: JsonValue | null
    updatedAt: Date
    _count: ComputedFieldActivityCountAggregateOutputType | null
    _avg: ComputedFieldActivityAvgAggregateOutputType | null
    _sum: ComputedFieldActivitySumAggregateOutputType | null
    _min: ComputedFieldActivityMinAggregateOutputType | null
    _max: ComputedFieldActivityMaxAggregateOutputType | null
  }

  type GetComputedFieldActivityGroupByPayload<T extends ComputedFieldActivityGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<ComputedFieldActivityGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof ComputedFieldActivityGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], ComputedFieldActivityGroupByOutputType[P]>
            : GetScalarType<T[P], ComputedFieldActivityGroupByOutputType[P]>
        }
      >
    >


  export type ComputedFieldActivitySelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    fieldId?: boolean
    tableId?: boolean
    baseId?: boolean
    status?: boolean
    activeTaskCount?: boolean
    processingTaskCount?: boolean
    generation?: boolean
    estimatedComplexity?: boolean
    estimatedDirtyRecords?: boolean
    hasAllTargetRecords?: boolean
    queuedAt?: boolean
    startedAt?: boolean
    lastCompletedAt?: boolean
    lastDurationMs?: boolean
    lastError?: boolean
    extensions?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["computedFieldActivity"]>

  export type ComputedFieldActivitySelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    fieldId?: boolean
    tableId?: boolean
    baseId?: boolean
    status?: boolean
    activeTaskCount?: boolean
    processingTaskCount?: boolean
    generation?: boolean
    estimatedComplexity?: boolean
    estimatedDirtyRecords?: boolean
    hasAllTargetRecords?: boolean
    queuedAt?: boolean
    startedAt?: boolean
    lastCompletedAt?: boolean
    lastDurationMs?: boolean
    lastError?: boolean
    extensions?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["computedFieldActivity"]>

  export type ComputedFieldActivitySelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    fieldId?: boolean
    tableId?: boolean
    baseId?: boolean
    status?: boolean
    activeTaskCount?: boolean
    processingTaskCount?: boolean
    generation?: boolean
    estimatedComplexity?: boolean
    estimatedDirtyRecords?: boolean
    hasAllTargetRecords?: boolean
    queuedAt?: boolean
    startedAt?: boolean
    lastCompletedAt?: boolean
    lastDurationMs?: boolean
    lastError?: boolean
    extensions?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["computedFieldActivity"]>

  export type ComputedFieldActivitySelectScalar = {
    fieldId?: boolean
    tableId?: boolean
    baseId?: boolean
    status?: boolean
    activeTaskCount?: boolean
    processingTaskCount?: boolean
    generation?: boolean
    estimatedComplexity?: boolean
    estimatedDirtyRecords?: boolean
    hasAllTargetRecords?: boolean
    queuedAt?: boolean
    startedAt?: boolean
    lastCompletedAt?: boolean
    lastDurationMs?: boolean
    lastError?: boolean
    extensions?: boolean
    updatedAt?: boolean
  }

  export type ComputedFieldActivityOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"fieldId" | "tableId" | "baseId" | "status" | "activeTaskCount" | "processingTaskCount" | "generation" | "estimatedComplexity" | "estimatedDirtyRecords" | "hasAllTargetRecords" | "queuedAt" | "startedAt" | "lastCompletedAt" | "lastDurationMs" | "lastError" | "extensions" | "updatedAt", ExtArgs["result"]["computedFieldActivity"]>

  export type $ComputedFieldActivityPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "ComputedFieldActivity"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      fieldId: string
      tableId: string
      baseId: string
      status: string
      activeTaskCount: number
      processingTaskCount: number
      generation: bigint
      estimatedComplexity: bigint
      estimatedDirtyRecords: bigint
      hasAllTargetRecords: boolean
      queuedAt: Date | null
      startedAt: Date | null
      lastCompletedAt: Date | null
      lastDurationMs: number | null
      lastError: Prisma.JsonValue | null
      extensions: Prisma.JsonValue | null
      updatedAt: Date
    }, ExtArgs["result"]["computedFieldActivity"]>
    composites: {}
  }

  type ComputedFieldActivityGetPayload<S extends boolean | null | undefined | ComputedFieldActivityDefaultArgs> = $Result.GetResult<Prisma.$ComputedFieldActivityPayload, S>

  type ComputedFieldActivityCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<ComputedFieldActivityFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: ComputedFieldActivityCountAggregateInputType | true
    }

  export interface ComputedFieldActivityDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['ComputedFieldActivity'], meta: { name: 'ComputedFieldActivity' } }
    /**
     * Find zero or one ComputedFieldActivity that matches the filter.
     * @param {ComputedFieldActivityFindUniqueArgs} args - Arguments to find a ComputedFieldActivity
     * @example
     * // Get one ComputedFieldActivity
     * const computedFieldActivity = await prisma.computedFieldActivity.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends ComputedFieldActivityFindUniqueArgs>(args: SelectSubset<T, ComputedFieldActivityFindUniqueArgs<ExtArgs>>): Prisma__ComputedFieldActivityClient<$Result.GetResult<Prisma.$ComputedFieldActivityPayload<ExtArgs>, T, "findUnique", ClientOptions> | null, null, ExtArgs, ClientOptions>

    /**
     * Find one ComputedFieldActivity that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {ComputedFieldActivityFindUniqueOrThrowArgs} args - Arguments to find a ComputedFieldActivity
     * @example
     * // Get one ComputedFieldActivity
     * const computedFieldActivity = await prisma.computedFieldActivity.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends ComputedFieldActivityFindUniqueOrThrowArgs>(args: SelectSubset<T, ComputedFieldActivityFindUniqueOrThrowArgs<ExtArgs>>): Prisma__ComputedFieldActivityClient<$Result.GetResult<Prisma.$ComputedFieldActivityPayload<ExtArgs>, T, "findUniqueOrThrow", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Find the first ComputedFieldActivity that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedFieldActivityFindFirstArgs} args - Arguments to find a ComputedFieldActivity
     * @example
     * // Get one ComputedFieldActivity
     * const computedFieldActivity = await prisma.computedFieldActivity.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends ComputedFieldActivityFindFirstArgs>(args?: SelectSubset<T, ComputedFieldActivityFindFirstArgs<ExtArgs>>): Prisma__ComputedFieldActivityClient<$Result.GetResult<Prisma.$ComputedFieldActivityPayload<ExtArgs>, T, "findFirst", ClientOptions> | null, null, ExtArgs, ClientOptions>

    /**
     * Find the first ComputedFieldActivity that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedFieldActivityFindFirstOrThrowArgs} args - Arguments to find a ComputedFieldActivity
     * @example
     * // Get one ComputedFieldActivity
     * const computedFieldActivity = await prisma.computedFieldActivity.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends ComputedFieldActivityFindFirstOrThrowArgs>(args?: SelectSubset<T, ComputedFieldActivityFindFirstOrThrowArgs<ExtArgs>>): Prisma__ComputedFieldActivityClient<$Result.GetResult<Prisma.$ComputedFieldActivityPayload<ExtArgs>, T, "findFirstOrThrow", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Find zero or more ComputedFieldActivities that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedFieldActivityFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all ComputedFieldActivities
     * const computedFieldActivities = await prisma.computedFieldActivity.findMany()
     * 
     * // Get first 10 ComputedFieldActivities
     * const computedFieldActivities = await prisma.computedFieldActivity.findMany({ take: 10 })
     * 
     * // Only select the `fieldId`
     * const computedFieldActivityWithFieldIdOnly = await prisma.computedFieldActivity.findMany({ select: { fieldId: true } })
     * 
     */
    findMany<T extends ComputedFieldActivityFindManyArgs>(args?: SelectSubset<T, ComputedFieldActivityFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ComputedFieldActivityPayload<ExtArgs>, T, "findMany", ClientOptions>>

    /**
     * Create a ComputedFieldActivity.
     * @param {ComputedFieldActivityCreateArgs} args - Arguments to create a ComputedFieldActivity.
     * @example
     * // Create one ComputedFieldActivity
     * const ComputedFieldActivity = await prisma.computedFieldActivity.create({
     *   data: {
     *     // ... data to create a ComputedFieldActivity
     *   }
     * })
     * 
     */
    create<T extends ComputedFieldActivityCreateArgs>(args: SelectSubset<T, ComputedFieldActivityCreateArgs<ExtArgs>>): Prisma__ComputedFieldActivityClient<$Result.GetResult<Prisma.$ComputedFieldActivityPayload<ExtArgs>, T, "create", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Create many ComputedFieldActivities.
     * @param {ComputedFieldActivityCreateManyArgs} args - Arguments to create many ComputedFieldActivities.
     * @example
     * // Create many ComputedFieldActivities
     * const computedFieldActivity = await prisma.computedFieldActivity.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends ComputedFieldActivityCreateManyArgs>(args?: SelectSubset<T, ComputedFieldActivityCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many ComputedFieldActivities and returns the data saved in the database.
     * @param {ComputedFieldActivityCreateManyAndReturnArgs} args - Arguments to create many ComputedFieldActivities.
     * @example
     * // Create many ComputedFieldActivities
     * const computedFieldActivity = await prisma.computedFieldActivity.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many ComputedFieldActivities and only return the `fieldId`
     * const computedFieldActivityWithFieldIdOnly = await prisma.computedFieldActivity.createManyAndReturn({
     *   select: { fieldId: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends ComputedFieldActivityCreateManyAndReturnArgs>(args?: SelectSubset<T, ComputedFieldActivityCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ComputedFieldActivityPayload<ExtArgs>, T, "createManyAndReturn", ClientOptions>>

    /**
     * Delete a ComputedFieldActivity.
     * @param {ComputedFieldActivityDeleteArgs} args - Arguments to delete one ComputedFieldActivity.
     * @example
     * // Delete one ComputedFieldActivity
     * const ComputedFieldActivity = await prisma.computedFieldActivity.delete({
     *   where: {
     *     // ... filter to delete one ComputedFieldActivity
     *   }
     * })
     * 
     */
    delete<T extends ComputedFieldActivityDeleteArgs>(args: SelectSubset<T, ComputedFieldActivityDeleteArgs<ExtArgs>>): Prisma__ComputedFieldActivityClient<$Result.GetResult<Prisma.$ComputedFieldActivityPayload<ExtArgs>, T, "delete", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Update one ComputedFieldActivity.
     * @param {ComputedFieldActivityUpdateArgs} args - Arguments to update one ComputedFieldActivity.
     * @example
     * // Update one ComputedFieldActivity
     * const computedFieldActivity = await prisma.computedFieldActivity.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends ComputedFieldActivityUpdateArgs>(args: SelectSubset<T, ComputedFieldActivityUpdateArgs<ExtArgs>>): Prisma__ComputedFieldActivityClient<$Result.GetResult<Prisma.$ComputedFieldActivityPayload<ExtArgs>, T, "update", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Delete zero or more ComputedFieldActivities.
     * @param {ComputedFieldActivityDeleteManyArgs} args - Arguments to filter ComputedFieldActivities to delete.
     * @example
     * // Delete a few ComputedFieldActivities
     * const { count } = await prisma.computedFieldActivity.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends ComputedFieldActivityDeleteManyArgs>(args?: SelectSubset<T, ComputedFieldActivityDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more ComputedFieldActivities.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedFieldActivityUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many ComputedFieldActivities
     * const computedFieldActivity = await prisma.computedFieldActivity.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends ComputedFieldActivityUpdateManyArgs>(args: SelectSubset<T, ComputedFieldActivityUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more ComputedFieldActivities and returns the data updated in the database.
     * @param {ComputedFieldActivityUpdateManyAndReturnArgs} args - Arguments to update many ComputedFieldActivities.
     * @example
     * // Update many ComputedFieldActivities
     * const computedFieldActivity = await prisma.computedFieldActivity.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more ComputedFieldActivities and only return the `fieldId`
     * const computedFieldActivityWithFieldIdOnly = await prisma.computedFieldActivity.updateManyAndReturn({
     *   select: { fieldId: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends ComputedFieldActivityUpdateManyAndReturnArgs>(args: SelectSubset<T, ComputedFieldActivityUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ComputedFieldActivityPayload<ExtArgs>, T, "updateManyAndReturn", ClientOptions>>

    /**
     * Create or update one ComputedFieldActivity.
     * @param {ComputedFieldActivityUpsertArgs} args - Arguments to update or create a ComputedFieldActivity.
     * @example
     * // Update or create a ComputedFieldActivity
     * const computedFieldActivity = await prisma.computedFieldActivity.upsert({
     *   create: {
     *     // ... data to create a ComputedFieldActivity
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the ComputedFieldActivity we want to update
     *   }
     * })
     */
    upsert<T extends ComputedFieldActivityUpsertArgs>(args: SelectSubset<T, ComputedFieldActivityUpsertArgs<ExtArgs>>): Prisma__ComputedFieldActivityClient<$Result.GetResult<Prisma.$ComputedFieldActivityPayload<ExtArgs>, T, "upsert", ClientOptions>, never, ExtArgs, ClientOptions>


    /**
     * Count the number of ComputedFieldActivities.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedFieldActivityCountArgs} args - Arguments to filter ComputedFieldActivities to count.
     * @example
     * // Count the number of ComputedFieldActivities
     * const count = await prisma.computedFieldActivity.count({
     *   where: {
     *     // ... the filter for the ComputedFieldActivities we want to count
     *   }
     * })
    **/
    count<T extends ComputedFieldActivityCountArgs>(
      args?: Subset<T, ComputedFieldActivityCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], ComputedFieldActivityCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a ComputedFieldActivity.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedFieldActivityAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends ComputedFieldActivityAggregateArgs>(args: Subset<T, ComputedFieldActivityAggregateArgs>): Prisma.PrismaPromise<GetComputedFieldActivityAggregateType<T>>

    /**
     * Group by ComputedFieldActivity.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedFieldActivityGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends ComputedFieldActivityGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: ComputedFieldActivityGroupByArgs['orderBy'] }
        : { orderBy?: ComputedFieldActivityGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, ComputedFieldActivityGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetComputedFieldActivityGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the ComputedFieldActivity model
   */
  readonly fields: ComputedFieldActivityFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for ComputedFieldActivity.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__ComputedFieldActivityClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the ComputedFieldActivity model
   */ 
  interface ComputedFieldActivityFieldRefs {
    readonly fieldId: FieldRef<"ComputedFieldActivity", 'String'>
    readonly tableId: FieldRef<"ComputedFieldActivity", 'String'>
    readonly baseId: FieldRef<"ComputedFieldActivity", 'String'>
    readonly status: FieldRef<"ComputedFieldActivity", 'String'>
    readonly activeTaskCount: FieldRef<"ComputedFieldActivity", 'Int'>
    readonly processingTaskCount: FieldRef<"ComputedFieldActivity", 'Int'>
    readonly generation: FieldRef<"ComputedFieldActivity", 'BigInt'>
    readonly estimatedComplexity: FieldRef<"ComputedFieldActivity", 'BigInt'>
    readonly estimatedDirtyRecords: FieldRef<"ComputedFieldActivity", 'BigInt'>
    readonly hasAllTargetRecords: FieldRef<"ComputedFieldActivity", 'Boolean'>
    readonly queuedAt: FieldRef<"ComputedFieldActivity", 'DateTime'>
    readonly startedAt: FieldRef<"ComputedFieldActivity", 'DateTime'>
    readonly lastCompletedAt: FieldRef<"ComputedFieldActivity", 'DateTime'>
    readonly lastDurationMs: FieldRef<"ComputedFieldActivity", 'Int'>
    readonly lastError: FieldRef<"ComputedFieldActivity", 'Json'>
    readonly extensions: FieldRef<"ComputedFieldActivity", 'Json'>
    readonly updatedAt: FieldRef<"ComputedFieldActivity", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * ComputedFieldActivity findUnique
   */
  export type ComputedFieldActivityFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedFieldActivity
     */
    select?: ComputedFieldActivitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedFieldActivity
     */
    omit?: ComputedFieldActivityOmit<ExtArgs> | null
    /**
     * Filter, which ComputedFieldActivity to fetch.
     */
    where: ComputedFieldActivityWhereUniqueInput
  }

  /**
   * ComputedFieldActivity findUniqueOrThrow
   */
  export type ComputedFieldActivityFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedFieldActivity
     */
    select?: ComputedFieldActivitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedFieldActivity
     */
    omit?: ComputedFieldActivityOmit<ExtArgs> | null
    /**
     * Filter, which ComputedFieldActivity to fetch.
     */
    where: ComputedFieldActivityWhereUniqueInput
  }

  /**
   * ComputedFieldActivity findFirst
   */
  export type ComputedFieldActivityFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedFieldActivity
     */
    select?: ComputedFieldActivitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedFieldActivity
     */
    omit?: ComputedFieldActivityOmit<ExtArgs> | null
    /**
     * Filter, which ComputedFieldActivity to fetch.
     */
    where?: ComputedFieldActivityWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ComputedFieldActivities to fetch.
     */
    orderBy?: ComputedFieldActivityOrderByWithRelationInput | ComputedFieldActivityOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for ComputedFieldActivities.
     */
    cursor?: ComputedFieldActivityWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ComputedFieldActivities from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ComputedFieldActivities.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of ComputedFieldActivities.
     */
    distinct?: ComputedFieldActivityScalarFieldEnum | ComputedFieldActivityScalarFieldEnum[]
  }

  /**
   * ComputedFieldActivity findFirstOrThrow
   */
  export type ComputedFieldActivityFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedFieldActivity
     */
    select?: ComputedFieldActivitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedFieldActivity
     */
    omit?: ComputedFieldActivityOmit<ExtArgs> | null
    /**
     * Filter, which ComputedFieldActivity to fetch.
     */
    where?: ComputedFieldActivityWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ComputedFieldActivities to fetch.
     */
    orderBy?: ComputedFieldActivityOrderByWithRelationInput | ComputedFieldActivityOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for ComputedFieldActivities.
     */
    cursor?: ComputedFieldActivityWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ComputedFieldActivities from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ComputedFieldActivities.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of ComputedFieldActivities.
     */
    distinct?: ComputedFieldActivityScalarFieldEnum | ComputedFieldActivityScalarFieldEnum[]
  }

  /**
   * ComputedFieldActivity findMany
   */
  export type ComputedFieldActivityFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedFieldActivity
     */
    select?: ComputedFieldActivitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedFieldActivity
     */
    omit?: ComputedFieldActivityOmit<ExtArgs> | null
    /**
     * Filter, which ComputedFieldActivities to fetch.
     */
    where?: ComputedFieldActivityWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ComputedFieldActivities to fetch.
     */
    orderBy?: ComputedFieldActivityOrderByWithRelationInput | ComputedFieldActivityOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing ComputedFieldActivities.
     */
    cursor?: ComputedFieldActivityWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ComputedFieldActivities from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ComputedFieldActivities.
     */
    skip?: number
    distinct?: ComputedFieldActivityScalarFieldEnum | ComputedFieldActivityScalarFieldEnum[]
  }

  /**
   * ComputedFieldActivity create
   */
  export type ComputedFieldActivityCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedFieldActivity
     */
    select?: ComputedFieldActivitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedFieldActivity
     */
    omit?: ComputedFieldActivityOmit<ExtArgs> | null
    /**
     * The data needed to create a ComputedFieldActivity.
     */
    data: XOR<ComputedFieldActivityCreateInput, ComputedFieldActivityUncheckedCreateInput>
  }

  /**
   * ComputedFieldActivity createMany
   */
  export type ComputedFieldActivityCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many ComputedFieldActivities.
     */
    data: ComputedFieldActivityCreateManyInput | ComputedFieldActivityCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * ComputedFieldActivity createManyAndReturn
   */
  export type ComputedFieldActivityCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedFieldActivity
     */
    select?: ComputedFieldActivitySelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedFieldActivity
     */
    omit?: ComputedFieldActivityOmit<ExtArgs> | null
    /**
     * The data used to create many ComputedFieldActivities.
     */
    data: ComputedFieldActivityCreateManyInput | ComputedFieldActivityCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * ComputedFieldActivity update
   */
  export type ComputedFieldActivityUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedFieldActivity
     */
    select?: ComputedFieldActivitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedFieldActivity
     */
    omit?: ComputedFieldActivityOmit<ExtArgs> | null
    /**
     * The data needed to update a ComputedFieldActivity.
     */
    data: XOR<ComputedFieldActivityUpdateInput, ComputedFieldActivityUncheckedUpdateInput>
    /**
     * Choose, which ComputedFieldActivity to update.
     */
    where: ComputedFieldActivityWhereUniqueInput
  }

  /**
   * ComputedFieldActivity updateMany
   */
  export type ComputedFieldActivityUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update ComputedFieldActivities.
     */
    data: XOR<ComputedFieldActivityUpdateManyMutationInput, ComputedFieldActivityUncheckedUpdateManyInput>
    /**
     * Filter which ComputedFieldActivities to update
     */
    where?: ComputedFieldActivityWhereInput
  }

  /**
   * ComputedFieldActivity updateManyAndReturn
   */
  export type ComputedFieldActivityUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedFieldActivity
     */
    select?: ComputedFieldActivitySelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedFieldActivity
     */
    omit?: ComputedFieldActivityOmit<ExtArgs> | null
    /**
     * The data used to update ComputedFieldActivities.
     */
    data: XOR<ComputedFieldActivityUpdateManyMutationInput, ComputedFieldActivityUncheckedUpdateManyInput>
    /**
     * Filter which ComputedFieldActivities to update
     */
    where?: ComputedFieldActivityWhereInput
  }

  /**
   * ComputedFieldActivity upsert
   */
  export type ComputedFieldActivityUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedFieldActivity
     */
    select?: ComputedFieldActivitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedFieldActivity
     */
    omit?: ComputedFieldActivityOmit<ExtArgs> | null
    /**
     * The filter to search for the ComputedFieldActivity to update in case it exists.
     */
    where: ComputedFieldActivityWhereUniqueInput
    /**
     * In case the ComputedFieldActivity found by the `where` argument doesn't exist, create a new ComputedFieldActivity with this data.
     */
    create: XOR<ComputedFieldActivityCreateInput, ComputedFieldActivityUncheckedCreateInput>
    /**
     * In case the ComputedFieldActivity was found with the provided `where` argument, update it with this data.
     */
    update: XOR<ComputedFieldActivityUpdateInput, ComputedFieldActivityUncheckedUpdateInput>
  }

  /**
   * ComputedFieldActivity delete
   */
  export type ComputedFieldActivityDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedFieldActivity
     */
    select?: ComputedFieldActivitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedFieldActivity
     */
    omit?: ComputedFieldActivityOmit<ExtArgs> | null
    /**
     * Filter which ComputedFieldActivity to delete.
     */
    where: ComputedFieldActivityWhereUniqueInput
  }

  /**
   * ComputedFieldActivity deleteMany
   */
  export type ComputedFieldActivityDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which ComputedFieldActivities to delete
     */
    where?: ComputedFieldActivityWhereInput
  }

  /**
   * ComputedFieldActivity without action
   */
  export type ComputedFieldActivityDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedFieldActivity
     */
    select?: ComputedFieldActivitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedFieldActivity
     */
    omit?: ComputedFieldActivityOmit<ExtArgs> | null
  }


  /**
   * Model ComputedTableActivity
   */

  export type AggregateComputedTableActivity = {
    _count: ComputedTableActivityCountAggregateOutputType | null
    _avg: ComputedTableActivityAvgAggregateOutputType | null
    _sum: ComputedTableActivitySumAggregateOutputType | null
    _min: ComputedTableActivityMinAggregateOutputType | null
    _max: ComputedTableActivityMaxAggregateOutputType | null
  }

  export type ComputedTableActivityAvgAggregateOutputType = {
    calculatingFieldCount: number | null
    queuedFieldCount: number | null
    estimatedComplexity: number | null
    generation: number | null
  }

  export type ComputedTableActivitySumAggregateOutputType = {
    calculatingFieldCount: number | null
    queuedFieldCount: number | null
    estimatedComplexity: bigint | null
    generation: bigint | null
  }

  export type ComputedTableActivityMinAggregateOutputType = {
    tableId: string | null
    baseId: string | null
    status: string | null
    calculatingFieldCount: number | null
    queuedFieldCount: number | null
    estimatedComplexity: bigint | null
    generation: bigint | null
    updatedAt: Date | null
  }

  export type ComputedTableActivityMaxAggregateOutputType = {
    tableId: string | null
    baseId: string | null
    status: string | null
    calculatingFieldCount: number | null
    queuedFieldCount: number | null
    estimatedComplexity: bigint | null
    generation: bigint | null
    updatedAt: Date | null
  }

  export type ComputedTableActivityCountAggregateOutputType = {
    tableId: number
    baseId: number
    status: number
    calculatingFieldCount: number
    queuedFieldCount: number
    estimatedComplexity: number
    recentCompletions: number
    generation: number
    updatedAt: number
    _all: number
  }


  export type ComputedTableActivityAvgAggregateInputType = {
    calculatingFieldCount?: true
    queuedFieldCount?: true
    estimatedComplexity?: true
    generation?: true
  }

  export type ComputedTableActivitySumAggregateInputType = {
    calculatingFieldCount?: true
    queuedFieldCount?: true
    estimatedComplexity?: true
    generation?: true
  }

  export type ComputedTableActivityMinAggregateInputType = {
    tableId?: true
    baseId?: true
    status?: true
    calculatingFieldCount?: true
    queuedFieldCount?: true
    estimatedComplexity?: true
    generation?: true
    updatedAt?: true
  }

  export type ComputedTableActivityMaxAggregateInputType = {
    tableId?: true
    baseId?: true
    status?: true
    calculatingFieldCount?: true
    queuedFieldCount?: true
    estimatedComplexity?: true
    generation?: true
    updatedAt?: true
  }

  export type ComputedTableActivityCountAggregateInputType = {
    tableId?: true
    baseId?: true
    status?: true
    calculatingFieldCount?: true
    queuedFieldCount?: true
    estimatedComplexity?: true
    recentCompletions?: true
    generation?: true
    updatedAt?: true
    _all?: true
  }

  export type ComputedTableActivityAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which ComputedTableActivity to aggregate.
     */
    where?: ComputedTableActivityWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ComputedTableActivities to fetch.
     */
    orderBy?: ComputedTableActivityOrderByWithRelationInput | ComputedTableActivityOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: ComputedTableActivityWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ComputedTableActivities from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ComputedTableActivities.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned ComputedTableActivities
    **/
    _count?: true | ComputedTableActivityCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: ComputedTableActivityAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: ComputedTableActivitySumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: ComputedTableActivityMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: ComputedTableActivityMaxAggregateInputType
  }

  export type GetComputedTableActivityAggregateType<T extends ComputedTableActivityAggregateArgs> = {
        [P in keyof T & keyof AggregateComputedTableActivity]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateComputedTableActivity[P]>
      : GetScalarType<T[P], AggregateComputedTableActivity[P]>
  }




  export type ComputedTableActivityGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ComputedTableActivityWhereInput
    orderBy?: ComputedTableActivityOrderByWithAggregationInput | ComputedTableActivityOrderByWithAggregationInput[]
    by: ComputedTableActivityScalarFieldEnum[] | ComputedTableActivityScalarFieldEnum
    having?: ComputedTableActivityScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: ComputedTableActivityCountAggregateInputType | true
    _avg?: ComputedTableActivityAvgAggregateInputType
    _sum?: ComputedTableActivitySumAggregateInputType
    _min?: ComputedTableActivityMinAggregateInputType
    _max?: ComputedTableActivityMaxAggregateInputType
  }

  export type ComputedTableActivityGroupByOutputType = {
    tableId: string
    baseId: string
    status: string
    calculatingFieldCount: number
    queuedFieldCount: number
    estimatedComplexity: bigint
    recentCompletions: JsonValue
    generation: bigint
    updatedAt: Date
    _count: ComputedTableActivityCountAggregateOutputType | null
    _avg: ComputedTableActivityAvgAggregateOutputType | null
    _sum: ComputedTableActivitySumAggregateOutputType | null
    _min: ComputedTableActivityMinAggregateOutputType | null
    _max: ComputedTableActivityMaxAggregateOutputType | null
  }

  type GetComputedTableActivityGroupByPayload<T extends ComputedTableActivityGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<ComputedTableActivityGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof ComputedTableActivityGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], ComputedTableActivityGroupByOutputType[P]>
            : GetScalarType<T[P], ComputedTableActivityGroupByOutputType[P]>
        }
      >
    >


  export type ComputedTableActivitySelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    tableId?: boolean
    baseId?: boolean
    status?: boolean
    calculatingFieldCount?: boolean
    queuedFieldCount?: boolean
    estimatedComplexity?: boolean
    recentCompletions?: boolean
    generation?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["computedTableActivity"]>

  export type ComputedTableActivitySelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    tableId?: boolean
    baseId?: boolean
    status?: boolean
    calculatingFieldCount?: boolean
    queuedFieldCount?: boolean
    estimatedComplexity?: boolean
    recentCompletions?: boolean
    generation?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["computedTableActivity"]>

  export type ComputedTableActivitySelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    tableId?: boolean
    baseId?: boolean
    status?: boolean
    calculatingFieldCount?: boolean
    queuedFieldCount?: boolean
    estimatedComplexity?: boolean
    recentCompletions?: boolean
    generation?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["computedTableActivity"]>

  export type ComputedTableActivitySelectScalar = {
    tableId?: boolean
    baseId?: boolean
    status?: boolean
    calculatingFieldCount?: boolean
    queuedFieldCount?: boolean
    estimatedComplexity?: boolean
    recentCompletions?: boolean
    generation?: boolean
    updatedAt?: boolean
  }

  export type ComputedTableActivityOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"tableId" | "baseId" | "status" | "calculatingFieldCount" | "queuedFieldCount" | "estimatedComplexity" | "recentCompletions" | "generation" | "updatedAt", ExtArgs["result"]["computedTableActivity"]>

  export type $ComputedTableActivityPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "ComputedTableActivity"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      tableId: string
      baseId: string
      status: string
      calculatingFieldCount: number
      queuedFieldCount: number
      estimatedComplexity: bigint
      recentCompletions: Prisma.JsonValue
      generation: bigint
      updatedAt: Date
    }, ExtArgs["result"]["computedTableActivity"]>
    composites: {}
  }

  type ComputedTableActivityGetPayload<S extends boolean | null | undefined | ComputedTableActivityDefaultArgs> = $Result.GetResult<Prisma.$ComputedTableActivityPayload, S>

  type ComputedTableActivityCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<ComputedTableActivityFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: ComputedTableActivityCountAggregateInputType | true
    }

  export interface ComputedTableActivityDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['ComputedTableActivity'], meta: { name: 'ComputedTableActivity' } }
    /**
     * Find zero or one ComputedTableActivity that matches the filter.
     * @param {ComputedTableActivityFindUniqueArgs} args - Arguments to find a ComputedTableActivity
     * @example
     * // Get one ComputedTableActivity
     * const computedTableActivity = await prisma.computedTableActivity.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends ComputedTableActivityFindUniqueArgs>(args: SelectSubset<T, ComputedTableActivityFindUniqueArgs<ExtArgs>>): Prisma__ComputedTableActivityClient<$Result.GetResult<Prisma.$ComputedTableActivityPayload<ExtArgs>, T, "findUnique", ClientOptions> | null, null, ExtArgs, ClientOptions>

    /**
     * Find one ComputedTableActivity that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {ComputedTableActivityFindUniqueOrThrowArgs} args - Arguments to find a ComputedTableActivity
     * @example
     * // Get one ComputedTableActivity
     * const computedTableActivity = await prisma.computedTableActivity.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends ComputedTableActivityFindUniqueOrThrowArgs>(args: SelectSubset<T, ComputedTableActivityFindUniqueOrThrowArgs<ExtArgs>>): Prisma__ComputedTableActivityClient<$Result.GetResult<Prisma.$ComputedTableActivityPayload<ExtArgs>, T, "findUniqueOrThrow", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Find the first ComputedTableActivity that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedTableActivityFindFirstArgs} args - Arguments to find a ComputedTableActivity
     * @example
     * // Get one ComputedTableActivity
     * const computedTableActivity = await prisma.computedTableActivity.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends ComputedTableActivityFindFirstArgs>(args?: SelectSubset<T, ComputedTableActivityFindFirstArgs<ExtArgs>>): Prisma__ComputedTableActivityClient<$Result.GetResult<Prisma.$ComputedTableActivityPayload<ExtArgs>, T, "findFirst", ClientOptions> | null, null, ExtArgs, ClientOptions>

    /**
     * Find the first ComputedTableActivity that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedTableActivityFindFirstOrThrowArgs} args - Arguments to find a ComputedTableActivity
     * @example
     * // Get one ComputedTableActivity
     * const computedTableActivity = await prisma.computedTableActivity.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends ComputedTableActivityFindFirstOrThrowArgs>(args?: SelectSubset<T, ComputedTableActivityFindFirstOrThrowArgs<ExtArgs>>): Prisma__ComputedTableActivityClient<$Result.GetResult<Prisma.$ComputedTableActivityPayload<ExtArgs>, T, "findFirstOrThrow", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Find zero or more ComputedTableActivities that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedTableActivityFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all ComputedTableActivities
     * const computedTableActivities = await prisma.computedTableActivity.findMany()
     * 
     * // Get first 10 ComputedTableActivities
     * const computedTableActivities = await prisma.computedTableActivity.findMany({ take: 10 })
     * 
     * // Only select the `tableId`
     * const computedTableActivityWithTableIdOnly = await prisma.computedTableActivity.findMany({ select: { tableId: true } })
     * 
     */
    findMany<T extends ComputedTableActivityFindManyArgs>(args?: SelectSubset<T, ComputedTableActivityFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ComputedTableActivityPayload<ExtArgs>, T, "findMany", ClientOptions>>

    /**
     * Create a ComputedTableActivity.
     * @param {ComputedTableActivityCreateArgs} args - Arguments to create a ComputedTableActivity.
     * @example
     * // Create one ComputedTableActivity
     * const ComputedTableActivity = await prisma.computedTableActivity.create({
     *   data: {
     *     // ... data to create a ComputedTableActivity
     *   }
     * })
     * 
     */
    create<T extends ComputedTableActivityCreateArgs>(args: SelectSubset<T, ComputedTableActivityCreateArgs<ExtArgs>>): Prisma__ComputedTableActivityClient<$Result.GetResult<Prisma.$ComputedTableActivityPayload<ExtArgs>, T, "create", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Create many ComputedTableActivities.
     * @param {ComputedTableActivityCreateManyArgs} args - Arguments to create many ComputedTableActivities.
     * @example
     * // Create many ComputedTableActivities
     * const computedTableActivity = await prisma.computedTableActivity.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends ComputedTableActivityCreateManyArgs>(args?: SelectSubset<T, ComputedTableActivityCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many ComputedTableActivities and returns the data saved in the database.
     * @param {ComputedTableActivityCreateManyAndReturnArgs} args - Arguments to create many ComputedTableActivities.
     * @example
     * // Create many ComputedTableActivities
     * const computedTableActivity = await prisma.computedTableActivity.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many ComputedTableActivities and only return the `tableId`
     * const computedTableActivityWithTableIdOnly = await prisma.computedTableActivity.createManyAndReturn({
     *   select: { tableId: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends ComputedTableActivityCreateManyAndReturnArgs>(args?: SelectSubset<T, ComputedTableActivityCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ComputedTableActivityPayload<ExtArgs>, T, "createManyAndReturn", ClientOptions>>

    /**
     * Delete a ComputedTableActivity.
     * @param {ComputedTableActivityDeleteArgs} args - Arguments to delete one ComputedTableActivity.
     * @example
     * // Delete one ComputedTableActivity
     * const ComputedTableActivity = await prisma.computedTableActivity.delete({
     *   where: {
     *     // ... filter to delete one ComputedTableActivity
     *   }
     * })
     * 
     */
    delete<T extends ComputedTableActivityDeleteArgs>(args: SelectSubset<T, ComputedTableActivityDeleteArgs<ExtArgs>>): Prisma__ComputedTableActivityClient<$Result.GetResult<Prisma.$ComputedTableActivityPayload<ExtArgs>, T, "delete", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Update one ComputedTableActivity.
     * @param {ComputedTableActivityUpdateArgs} args - Arguments to update one ComputedTableActivity.
     * @example
     * // Update one ComputedTableActivity
     * const computedTableActivity = await prisma.computedTableActivity.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends ComputedTableActivityUpdateArgs>(args: SelectSubset<T, ComputedTableActivityUpdateArgs<ExtArgs>>): Prisma__ComputedTableActivityClient<$Result.GetResult<Prisma.$ComputedTableActivityPayload<ExtArgs>, T, "update", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Delete zero or more ComputedTableActivities.
     * @param {ComputedTableActivityDeleteManyArgs} args - Arguments to filter ComputedTableActivities to delete.
     * @example
     * // Delete a few ComputedTableActivities
     * const { count } = await prisma.computedTableActivity.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends ComputedTableActivityDeleteManyArgs>(args?: SelectSubset<T, ComputedTableActivityDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more ComputedTableActivities.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedTableActivityUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many ComputedTableActivities
     * const computedTableActivity = await prisma.computedTableActivity.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends ComputedTableActivityUpdateManyArgs>(args: SelectSubset<T, ComputedTableActivityUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more ComputedTableActivities and returns the data updated in the database.
     * @param {ComputedTableActivityUpdateManyAndReturnArgs} args - Arguments to update many ComputedTableActivities.
     * @example
     * // Update many ComputedTableActivities
     * const computedTableActivity = await prisma.computedTableActivity.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more ComputedTableActivities and only return the `tableId`
     * const computedTableActivityWithTableIdOnly = await prisma.computedTableActivity.updateManyAndReturn({
     *   select: { tableId: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends ComputedTableActivityUpdateManyAndReturnArgs>(args: SelectSubset<T, ComputedTableActivityUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ComputedTableActivityPayload<ExtArgs>, T, "updateManyAndReturn", ClientOptions>>

    /**
     * Create or update one ComputedTableActivity.
     * @param {ComputedTableActivityUpsertArgs} args - Arguments to update or create a ComputedTableActivity.
     * @example
     * // Update or create a ComputedTableActivity
     * const computedTableActivity = await prisma.computedTableActivity.upsert({
     *   create: {
     *     // ... data to create a ComputedTableActivity
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the ComputedTableActivity we want to update
     *   }
     * })
     */
    upsert<T extends ComputedTableActivityUpsertArgs>(args: SelectSubset<T, ComputedTableActivityUpsertArgs<ExtArgs>>): Prisma__ComputedTableActivityClient<$Result.GetResult<Prisma.$ComputedTableActivityPayload<ExtArgs>, T, "upsert", ClientOptions>, never, ExtArgs, ClientOptions>


    /**
     * Count the number of ComputedTableActivities.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedTableActivityCountArgs} args - Arguments to filter ComputedTableActivities to count.
     * @example
     * // Count the number of ComputedTableActivities
     * const count = await prisma.computedTableActivity.count({
     *   where: {
     *     // ... the filter for the ComputedTableActivities we want to count
     *   }
     * })
    **/
    count<T extends ComputedTableActivityCountArgs>(
      args?: Subset<T, ComputedTableActivityCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], ComputedTableActivityCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a ComputedTableActivity.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedTableActivityAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends ComputedTableActivityAggregateArgs>(args: Subset<T, ComputedTableActivityAggregateArgs>): Prisma.PrismaPromise<GetComputedTableActivityAggregateType<T>>

    /**
     * Group by ComputedTableActivity.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedTableActivityGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends ComputedTableActivityGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: ComputedTableActivityGroupByArgs['orderBy'] }
        : { orderBy?: ComputedTableActivityGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, ComputedTableActivityGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetComputedTableActivityGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the ComputedTableActivity model
   */
  readonly fields: ComputedTableActivityFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for ComputedTableActivity.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__ComputedTableActivityClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the ComputedTableActivity model
   */ 
  interface ComputedTableActivityFieldRefs {
    readonly tableId: FieldRef<"ComputedTableActivity", 'String'>
    readonly baseId: FieldRef<"ComputedTableActivity", 'String'>
    readonly status: FieldRef<"ComputedTableActivity", 'String'>
    readonly calculatingFieldCount: FieldRef<"ComputedTableActivity", 'Int'>
    readonly queuedFieldCount: FieldRef<"ComputedTableActivity", 'Int'>
    readonly estimatedComplexity: FieldRef<"ComputedTableActivity", 'BigInt'>
    readonly recentCompletions: FieldRef<"ComputedTableActivity", 'Json'>
    readonly generation: FieldRef<"ComputedTableActivity", 'BigInt'>
    readonly updatedAt: FieldRef<"ComputedTableActivity", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * ComputedTableActivity findUnique
   */
  export type ComputedTableActivityFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedTableActivity
     */
    select?: ComputedTableActivitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedTableActivity
     */
    omit?: ComputedTableActivityOmit<ExtArgs> | null
    /**
     * Filter, which ComputedTableActivity to fetch.
     */
    where: ComputedTableActivityWhereUniqueInput
  }

  /**
   * ComputedTableActivity findUniqueOrThrow
   */
  export type ComputedTableActivityFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedTableActivity
     */
    select?: ComputedTableActivitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedTableActivity
     */
    omit?: ComputedTableActivityOmit<ExtArgs> | null
    /**
     * Filter, which ComputedTableActivity to fetch.
     */
    where: ComputedTableActivityWhereUniqueInput
  }

  /**
   * ComputedTableActivity findFirst
   */
  export type ComputedTableActivityFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedTableActivity
     */
    select?: ComputedTableActivitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedTableActivity
     */
    omit?: ComputedTableActivityOmit<ExtArgs> | null
    /**
     * Filter, which ComputedTableActivity to fetch.
     */
    where?: ComputedTableActivityWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ComputedTableActivities to fetch.
     */
    orderBy?: ComputedTableActivityOrderByWithRelationInput | ComputedTableActivityOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for ComputedTableActivities.
     */
    cursor?: ComputedTableActivityWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ComputedTableActivities from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ComputedTableActivities.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of ComputedTableActivities.
     */
    distinct?: ComputedTableActivityScalarFieldEnum | ComputedTableActivityScalarFieldEnum[]
  }

  /**
   * ComputedTableActivity findFirstOrThrow
   */
  export type ComputedTableActivityFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedTableActivity
     */
    select?: ComputedTableActivitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedTableActivity
     */
    omit?: ComputedTableActivityOmit<ExtArgs> | null
    /**
     * Filter, which ComputedTableActivity to fetch.
     */
    where?: ComputedTableActivityWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ComputedTableActivities to fetch.
     */
    orderBy?: ComputedTableActivityOrderByWithRelationInput | ComputedTableActivityOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for ComputedTableActivities.
     */
    cursor?: ComputedTableActivityWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ComputedTableActivities from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ComputedTableActivities.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of ComputedTableActivities.
     */
    distinct?: ComputedTableActivityScalarFieldEnum | ComputedTableActivityScalarFieldEnum[]
  }

  /**
   * ComputedTableActivity findMany
   */
  export type ComputedTableActivityFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedTableActivity
     */
    select?: ComputedTableActivitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedTableActivity
     */
    omit?: ComputedTableActivityOmit<ExtArgs> | null
    /**
     * Filter, which ComputedTableActivities to fetch.
     */
    where?: ComputedTableActivityWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ComputedTableActivities to fetch.
     */
    orderBy?: ComputedTableActivityOrderByWithRelationInput | ComputedTableActivityOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing ComputedTableActivities.
     */
    cursor?: ComputedTableActivityWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ComputedTableActivities from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ComputedTableActivities.
     */
    skip?: number
    distinct?: ComputedTableActivityScalarFieldEnum | ComputedTableActivityScalarFieldEnum[]
  }

  /**
   * ComputedTableActivity create
   */
  export type ComputedTableActivityCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedTableActivity
     */
    select?: ComputedTableActivitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedTableActivity
     */
    omit?: ComputedTableActivityOmit<ExtArgs> | null
    /**
     * The data needed to create a ComputedTableActivity.
     */
    data: XOR<ComputedTableActivityCreateInput, ComputedTableActivityUncheckedCreateInput>
  }

  /**
   * ComputedTableActivity createMany
   */
  export type ComputedTableActivityCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many ComputedTableActivities.
     */
    data: ComputedTableActivityCreateManyInput | ComputedTableActivityCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * ComputedTableActivity createManyAndReturn
   */
  export type ComputedTableActivityCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedTableActivity
     */
    select?: ComputedTableActivitySelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedTableActivity
     */
    omit?: ComputedTableActivityOmit<ExtArgs> | null
    /**
     * The data used to create many ComputedTableActivities.
     */
    data: ComputedTableActivityCreateManyInput | ComputedTableActivityCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * ComputedTableActivity update
   */
  export type ComputedTableActivityUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedTableActivity
     */
    select?: ComputedTableActivitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedTableActivity
     */
    omit?: ComputedTableActivityOmit<ExtArgs> | null
    /**
     * The data needed to update a ComputedTableActivity.
     */
    data: XOR<ComputedTableActivityUpdateInput, ComputedTableActivityUncheckedUpdateInput>
    /**
     * Choose, which ComputedTableActivity to update.
     */
    where: ComputedTableActivityWhereUniqueInput
  }

  /**
   * ComputedTableActivity updateMany
   */
  export type ComputedTableActivityUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update ComputedTableActivities.
     */
    data: XOR<ComputedTableActivityUpdateManyMutationInput, ComputedTableActivityUncheckedUpdateManyInput>
    /**
     * Filter which ComputedTableActivities to update
     */
    where?: ComputedTableActivityWhereInput
  }

  /**
   * ComputedTableActivity updateManyAndReturn
   */
  export type ComputedTableActivityUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedTableActivity
     */
    select?: ComputedTableActivitySelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedTableActivity
     */
    omit?: ComputedTableActivityOmit<ExtArgs> | null
    /**
     * The data used to update ComputedTableActivities.
     */
    data: XOR<ComputedTableActivityUpdateManyMutationInput, ComputedTableActivityUncheckedUpdateManyInput>
    /**
     * Filter which ComputedTableActivities to update
     */
    where?: ComputedTableActivityWhereInput
  }

  /**
   * ComputedTableActivity upsert
   */
  export type ComputedTableActivityUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedTableActivity
     */
    select?: ComputedTableActivitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedTableActivity
     */
    omit?: ComputedTableActivityOmit<ExtArgs> | null
    /**
     * The filter to search for the ComputedTableActivity to update in case it exists.
     */
    where: ComputedTableActivityWhereUniqueInput
    /**
     * In case the ComputedTableActivity found by the `where` argument doesn't exist, create a new ComputedTableActivity with this data.
     */
    create: XOR<ComputedTableActivityCreateInput, ComputedTableActivityUncheckedCreateInput>
    /**
     * In case the ComputedTableActivity was found with the provided `where` argument, update it with this data.
     */
    update: XOR<ComputedTableActivityUpdateInput, ComputedTableActivityUncheckedUpdateInput>
  }

  /**
   * ComputedTableActivity delete
   */
  export type ComputedTableActivityDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedTableActivity
     */
    select?: ComputedTableActivitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedTableActivity
     */
    omit?: ComputedTableActivityOmit<ExtArgs> | null
    /**
     * Filter which ComputedTableActivity to delete.
     */
    where: ComputedTableActivityWhereUniqueInput
  }

  /**
   * ComputedTableActivity deleteMany
   */
  export type ComputedTableActivityDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which ComputedTableActivities to delete
     */
    where?: ComputedTableActivityWhereInput
  }

  /**
   * ComputedTableActivity without action
   */
  export type ComputedTableActivityDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedTableActivity
     */
    select?: ComputedTableActivitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedTableActivity
     */
    omit?: ComputedTableActivityOmit<ExtArgs> | null
  }


  /**
   * Model ComputedTaskFieldRef
   */

  export type AggregateComputedTaskFieldRef = {
    _count: ComputedTaskFieldRefCountAggregateOutputType | null
    _min: ComputedTaskFieldRefMinAggregateOutputType | null
    _max: ComputedTaskFieldRefMaxAggregateOutputType | null
  }

  export type ComputedTaskFieldRefMinAggregateOutputType = {
    taskId: string | null
    fieldId: string | null
    tableId: string | null
    baseId: string | null
    wasProcessing: boolean | null
    createdAt: Date | null
  }

  export type ComputedTaskFieldRefMaxAggregateOutputType = {
    taskId: string | null
    fieldId: string | null
    tableId: string | null
    baseId: string | null
    wasProcessing: boolean | null
    createdAt: Date | null
  }

  export type ComputedTaskFieldRefCountAggregateOutputType = {
    taskId: number
    fieldId: number
    tableId: number
    baseId: number
    wasProcessing: number
    createdAt: number
    _all: number
  }


  export type ComputedTaskFieldRefMinAggregateInputType = {
    taskId?: true
    fieldId?: true
    tableId?: true
    baseId?: true
    wasProcessing?: true
    createdAt?: true
  }

  export type ComputedTaskFieldRefMaxAggregateInputType = {
    taskId?: true
    fieldId?: true
    tableId?: true
    baseId?: true
    wasProcessing?: true
    createdAt?: true
  }

  export type ComputedTaskFieldRefCountAggregateInputType = {
    taskId?: true
    fieldId?: true
    tableId?: true
    baseId?: true
    wasProcessing?: true
    createdAt?: true
    _all?: true
  }

  export type ComputedTaskFieldRefAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which ComputedTaskFieldRef to aggregate.
     */
    where?: ComputedTaskFieldRefWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ComputedTaskFieldRefs to fetch.
     */
    orderBy?: ComputedTaskFieldRefOrderByWithRelationInput | ComputedTaskFieldRefOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: ComputedTaskFieldRefWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ComputedTaskFieldRefs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ComputedTaskFieldRefs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned ComputedTaskFieldRefs
    **/
    _count?: true | ComputedTaskFieldRefCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: ComputedTaskFieldRefMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: ComputedTaskFieldRefMaxAggregateInputType
  }

  export type GetComputedTaskFieldRefAggregateType<T extends ComputedTaskFieldRefAggregateArgs> = {
        [P in keyof T & keyof AggregateComputedTaskFieldRef]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateComputedTaskFieldRef[P]>
      : GetScalarType<T[P], AggregateComputedTaskFieldRef[P]>
  }




  export type ComputedTaskFieldRefGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ComputedTaskFieldRefWhereInput
    orderBy?: ComputedTaskFieldRefOrderByWithAggregationInput | ComputedTaskFieldRefOrderByWithAggregationInput[]
    by: ComputedTaskFieldRefScalarFieldEnum[] | ComputedTaskFieldRefScalarFieldEnum
    having?: ComputedTaskFieldRefScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: ComputedTaskFieldRefCountAggregateInputType | true
    _min?: ComputedTaskFieldRefMinAggregateInputType
    _max?: ComputedTaskFieldRefMaxAggregateInputType
  }

  export type ComputedTaskFieldRefGroupByOutputType = {
    taskId: string
    fieldId: string
    tableId: string
    baseId: string
    wasProcessing: boolean
    createdAt: Date
    _count: ComputedTaskFieldRefCountAggregateOutputType | null
    _min: ComputedTaskFieldRefMinAggregateOutputType | null
    _max: ComputedTaskFieldRefMaxAggregateOutputType | null
  }

  type GetComputedTaskFieldRefGroupByPayload<T extends ComputedTaskFieldRefGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<ComputedTaskFieldRefGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof ComputedTaskFieldRefGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], ComputedTaskFieldRefGroupByOutputType[P]>
            : GetScalarType<T[P], ComputedTaskFieldRefGroupByOutputType[P]>
        }
      >
    >


  export type ComputedTaskFieldRefSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    taskId?: boolean
    fieldId?: boolean
    tableId?: boolean
    baseId?: boolean
    wasProcessing?: boolean
    createdAt?: boolean
  }, ExtArgs["result"]["computedTaskFieldRef"]>

  export type ComputedTaskFieldRefSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    taskId?: boolean
    fieldId?: boolean
    tableId?: boolean
    baseId?: boolean
    wasProcessing?: boolean
    createdAt?: boolean
  }, ExtArgs["result"]["computedTaskFieldRef"]>

  export type ComputedTaskFieldRefSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    taskId?: boolean
    fieldId?: boolean
    tableId?: boolean
    baseId?: boolean
    wasProcessing?: boolean
    createdAt?: boolean
  }, ExtArgs["result"]["computedTaskFieldRef"]>

  export type ComputedTaskFieldRefSelectScalar = {
    taskId?: boolean
    fieldId?: boolean
    tableId?: boolean
    baseId?: boolean
    wasProcessing?: boolean
    createdAt?: boolean
  }

  export type ComputedTaskFieldRefOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"taskId" | "fieldId" | "tableId" | "baseId" | "wasProcessing" | "createdAt", ExtArgs["result"]["computedTaskFieldRef"]>

  export type $ComputedTaskFieldRefPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "ComputedTaskFieldRef"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      taskId: string
      fieldId: string
      tableId: string
      baseId: string
      wasProcessing: boolean
      createdAt: Date
    }, ExtArgs["result"]["computedTaskFieldRef"]>
    composites: {}
  }

  type ComputedTaskFieldRefGetPayload<S extends boolean | null | undefined | ComputedTaskFieldRefDefaultArgs> = $Result.GetResult<Prisma.$ComputedTaskFieldRefPayload, S>

  type ComputedTaskFieldRefCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<ComputedTaskFieldRefFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: ComputedTaskFieldRefCountAggregateInputType | true
    }

  export interface ComputedTaskFieldRefDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['ComputedTaskFieldRef'], meta: { name: 'ComputedTaskFieldRef' } }
    /**
     * Find zero or one ComputedTaskFieldRef that matches the filter.
     * @param {ComputedTaskFieldRefFindUniqueArgs} args - Arguments to find a ComputedTaskFieldRef
     * @example
     * // Get one ComputedTaskFieldRef
     * const computedTaskFieldRef = await prisma.computedTaskFieldRef.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends ComputedTaskFieldRefFindUniqueArgs>(args: SelectSubset<T, ComputedTaskFieldRefFindUniqueArgs<ExtArgs>>): Prisma__ComputedTaskFieldRefClient<$Result.GetResult<Prisma.$ComputedTaskFieldRefPayload<ExtArgs>, T, "findUnique", ClientOptions> | null, null, ExtArgs, ClientOptions>

    /**
     * Find one ComputedTaskFieldRef that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {ComputedTaskFieldRefFindUniqueOrThrowArgs} args - Arguments to find a ComputedTaskFieldRef
     * @example
     * // Get one ComputedTaskFieldRef
     * const computedTaskFieldRef = await prisma.computedTaskFieldRef.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends ComputedTaskFieldRefFindUniqueOrThrowArgs>(args: SelectSubset<T, ComputedTaskFieldRefFindUniqueOrThrowArgs<ExtArgs>>): Prisma__ComputedTaskFieldRefClient<$Result.GetResult<Prisma.$ComputedTaskFieldRefPayload<ExtArgs>, T, "findUniqueOrThrow", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Find the first ComputedTaskFieldRef that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedTaskFieldRefFindFirstArgs} args - Arguments to find a ComputedTaskFieldRef
     * @example
     * // Get one ComputedTaskFieldRef
     * const computedTaskFieldRef = await prisma.computedTaskFieldRef.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends ComputedTaskFieldRefFindFirstArgs>(args?: SelectSubset<T, ComputedTaskFieldRefFindFirstArgs<ExtArgs>>): Prisma__ComputedTaskFieldRefClient<$Result.GetResult<Prisma.$ComputedTaskFieldRefPayload<ExtArgs>, T, "findFirst", ClientOptions> | null, null, ExtArgs, ClientOptions>

    /**
     * Find the first ComputedTaskFieldRef that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedTaskFieldRefFindFirstOrThrowArgs} args - Arguments to find a ComputedTaskFieldRef
     * @example
     * // Get one ComputedTaskFieldRef
     * const computedTaskFieldRef = await prisma.computedTaskFieldRef.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends ComputedTaskFieldRefFindFirstOrThrowArgs>(args?: SelectSubset<T, ComputedTaskFieldRefFindFirstOrThrowArgs<ExtArgs>>): Prisma__ComputedTaskFieldRefClient<$Result.GetResult<Prisma.$ComputedTaskFieldRefPayload<ExtArgs>, T, "findFirstOrThrow", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Find zero or more ComputedTaskFieldRefs that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedTaskFieldRefFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all ComputedTaskFieldRefs
     * const computedTaskFieldRefs = await prisma.computedTaskFieldRef.findMany()
     * 
     * // Get first 10 ComputedTaskFieldRefs
     * const computedTaskFieldRefs = await prisma.computedTaskFieldRef.findMany({ take: 10 })
     * 
     * // Only select the `taskId`
     * const computedTaskFieldRefWithTaskIdOnly = await prisma.computedTaskFieldRef.findMany({ select: { taskId: true } })
     * 
     */
    findMany<T extends ComputedTaskFieldRefFindManyArgs>(args?: SelectSubset<T, ComputedTaskFieldRefFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ComputedTaskFieldRefPayload<ExtArgs>, T, "findMany", ClientOptions>>

    /**
     * Create a ComputedTaskFieldRef.
     * @param {ComputedTaskFieldRefCreateArgs} args - Arguments to create a ComputedTaskFieldRef.
     * @example
     * // Create one ComputedTaskFieldRef
     * const ComputedTaskFieldRef = await prisma.computedTaskFieldRef.create({
     *   data: {
     *     // ... data to create a ComputedTaskFieldRef
     *   }
     * })
     * 
     */
    create<T extends ComputedTaskFieldRefCreateArgs>(args: SelectSubset<T, ComputedTaskFieldRefCreateArgs<ExtArgs>>): Prisma__ComputedTaskFieldRefClient<$Result.GetResult<Prisma.$ComputedTaskFieldRefPayload<ExtArgs>, T, "create", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Create many ComputedTaskFieldRefs.
     * @param {ComputedTaskFieldRefCreateManyArgs} args - Arguments to create many ComputedTaskFieldRefs.
     * @example
     * // Create many ComputedTaskFieldRefs
     * const computedTaskFieldRef = await prisma.computedTaskFieldRef.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends ComputedTaskFieldRefCreateManyArgs>(args?: SelectSubset<T, ComputedTaskFieldRefCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many ComputedTaskFieldRefs and returns the data saved in the database.
     * @param {ComputedTaskFieldRefCreateManyAndReturnArgs} args - Arguments to create many ComputedTaskFieldRefs.
     * @example
     * // Create many ComputedTaskFieldRefs
     * const computedTaskFieldRef = await prisma.computedTaskFieldRef.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many ComputedTaskFieldRefs and only return the `taskId`
     * const computedTaskFieldRefWithTaskIdOnly = await prisma.computedTaskFieldRef.createManyAndReturn({
     *   select: { taskId: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends ComputedTaskFieldRefCreateManyAndReturnArgs>(args?: SelectSubset<T, ComputedTaskFieldRefCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ComputedTaskFieldRefPayload<ExtArgs>, T, "createManyAndReturn", ClientOptions>>

    /**
     * Delete a ComputedTaskFieldRef.
     * @param {ComputedTaskFieldRefDeleteArgs} args - Arguments to delete one ComputedTaskFieldRef.
     * @example
     * // Delete one ComputedTaskFieldRef
     * const ComputedTaskFieldRef = await prisma.computedTaskFieldRef.delete({
     *   where: {
     *     // ... filter to delete one ComputedTaskFieldRef
     *   }
     * })
     * 
     */
    delete<T extends ComputedTaskFieldRefDeleteArgs>(args: SelectSubset<T, ComputedTaskFieldRefDeleteArgs<ExtArgs>>): Prisma__ComputedTaskFieldRefClient<$Result.GetResult<Prisma.$ComputedTaskFieldRefPayload<ExtArgs>, T, "delete", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Update one ComputedTaskFieldRef.
     * @param {ComputedTaskFieldRefUpdateArgs} args - Arguments to update one ComputedTaskFieldRef.
     * @example
     * // Update one ComputedTaskFieldRef
     * const computedTaskFieldRef = await prisma.computedTaskFieldRef.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends ComputedTaskFieldRefUpdateArgs>(args: SelectSubset<T, ComputedTaskFieldRefUpdateArgs<ExtArgs>>): Prisma__ComputedTaskFieldRefClient<$Result.GetResult<Prisma.$ComputedTaskFieldRefPayload<ExtArgs>, T, "update", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Delete zero or more ComputedTaskFieldRefs.
     * @param {ComputedTaskFieldRefDeleteManyArgs} args - Arguments to filter ComputedTaskFieldRefs to delete.
     * @example
     * // Delete a few ComputedTaskFieldRefs
     * const { count } = await prisma.computedTaskFieldRef.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends ComputedTaskFieldRefDeleteManyArgs>(args?: SelectSubset<T, ComputedTaskFieldRefDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more ComputedTaskFieldRefs.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedTaskFieldRefUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many ComputedTaskFieldRefs
     * const computedTaskFieldRef = await prisma.computedTaskFieldRef.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends ComputedTaskFieldRefUpdateManyArgs>(args: SelectSubset<T, ComputedTaskFieldRefUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more ComputedTaskFieldRefs and returns the data updated in the database.
     * @param {ComputedTaskFieldRefUpdateManyAndReturnArgs} args - Arguments to update many ComputedTaskFieldRefs.
     * @example
     * // Update many ComputedTaskFieldRefs
     * const computedTaskFieldRef = await prisma.computedTaskFieldRef.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more ComputedTaskFieldRefs and only return the `taskId`
     * const computedTaskFieldRefWithTaskIdOnly = await prisma.computedTaskFieldRef.updateManyAndReturn({
     *   select: { taskId: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends ComputedTaskFieldRefUpdateManyAndReturnArgs>(args: SelectSubset<T, ComputedTaskFieldRefUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ComputedTaskFieldRefPayload<ExtArgs>, T, "updateManyAndReturn", ClientOptions>>

    /**
     * Create or update one ComputedTaskFieldRef.
     * @param {ComputedTaskFieldRefUpsertArgs} args - Arguments to update or create a ComputedTaskFieldRef.
     * @example
     * // Update or create a ComputedTaskFieldRef
     * const computedTaskFieldRef = await prisma.computedTaskFieldRef.upsert({
     *   create: {
     *     // ... data to create a ComputedTaskFieldRef
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the ComputedTaskFieldRef we want to update
     *   }
     * })
     */
    upsert<T extends ComputedTaskFieldRefUpsertArgs>(args: SelectSubset<T, ComputedTaskFieldRefUpsertArgs<ExtArgs>>): Prisma__ComputedTaskFieldRefClient<$Result.GetResult<Prisma.$ComputedTaskFieldRefPayload<ExtArgs>, T, "upsert", ClientOptions>, never, ExtArgs, ClientOptions>


    /**
     * Count the number of ComputedTaskFieldRefs.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedTaskFieldRefCountArgs} args - Arguments to filter ComputedTaskFieldRefs to count.
     * @example
     * // Count the number of ComputedTaskFieldRefs
     * const count = await prisma.computedTaskFieldRef.count({
     *   where: {
     *     // ... the filter for the ComputedTaskFieldRefs we want to count
     *   }
     * })
    **/
    count<T extends ComputedTaskFieldRefCountArgs>(
      args?: Subset<T, ComputedTaskFieldRefCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], ComputedTaskFieldRefCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a ComputedTaskFieldRef.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedTaskFieldRefAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends ComputedTaskFieldRefAggregateArgs>(args: Subset<T, ComputedTaskFieldRefAggregateArgs>): Prisma.PrismaPromise<GetComputedTaskFieldRefAggregateType<T>>

    /**
     * Group by ComputedTaskFieldRef.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ComputedTaskFieldRefGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends ComputedTaskFieldRefGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: ComputedTaskFieldRefGroupByArgs['orderBy'] }
        : { orderBy?: ComputedTaskFieldRefGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, ComputedTaskFieldRefGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetComputedTaskFieldRefGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the ComputedTaskFieldRef model
   */
  readonly fields: ComputedTaskFieldRefFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for ComputedTaskFieldRef.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__ComputedTaskFieldRefClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the ComputedTaskFieldRef model
   */ 
  interface ComputedTaskFieldRefFieldRefs {
    readonly taskId: FieldRef<"ComputedTaskFieldRef", 'String'>
    readonly fieldId: FieldRef<"ComputedTaskFieldRef", 'String'>
    readonly tableId: FieldRef<"ComputedTaskFieldRef", 'String'>
    readonly baseId: FieldRef<"ComputedTaskFieldRef", 'String'>
    readonly wasProcessing: FieldRef<"ComputedTaskFieldRef", 'Boolean'>
    readonly createdAt: FieldRef<"ComputedTaskFieldRef", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * ComputedTaskFieldRef findUnique
   */
  export type ComputedTaskFieldRefFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedTaskFieldRef
     */
    select?: ComputedTaskFieldRefSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedTaskFieldRef
     */
    omit?: ComputedTaskFieldRefOmit<ExtArgs> | null
    /**
     * Filter, which ComputedTaskFieldRef to fetch.
     */
    where: ComputedTaskFieldRefWhereUniqueInput
  }

  /**
   * ComputedTaskFieldRef findUniqueOrThrow
   */
  export type ComputedTaskFieldRefFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedTaskFieldRef
     */
    select?: ComputedTaskFieldRefSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedTaskFieldRef
     */
    omit?: ComputedTaskFieldRefOmit<ExtArgs> | null
    /**
     * Filter, which ComputedTaskFieldRef to fetch.
     */
    where: ComputedTaskFieldRefWhereUniqueInput
  }

  /**
   * ComputedTaskFieldRef findFirst
   */
  export type ComputedTaskFieldRefFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedTaskFieldRef
     */
    select?: ComputedTaskFieldRefSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedTaskFieldRef
     */
    omit?: ComputedTaskFieldRefOmit<ExtArgs> | null
    /**
     * Filter, which ComputedTaskFieldRef to fetch.
     */
    where?: ComputedTaskFieldRefWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ComputedTaskFieldRefs to fetch.
     */
    orderBy?: ComputedTaskFieldRefOrderByWithRelationInput | ComputedTaskFieldRefOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for ComputedTaskFieldRefs.
     */
    cursor?: ComputedTaskFieldRefWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ComputedTaskFieldRefs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ComputedTaskFieldRefs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of ComputedTaskFieldRefs.
     */
    distinct?: ComputedTaskFieldRefScalarFieldEnum | ComputedTaskFieldRefScalarFieldEnum[]
  }

  /**
   * ComputedTaskFieldRef findFirstOrThrow
   */
  export type ComputedTaskFieldRefFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedTaskFieldRef
     */
    select?: ComputedTaskFieldRefSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedTaskFieldRef
     */
    omit?: ComputedTaskFieldRefOmit<ExtArgs> | null
    /**
     * Filter, which ComputedTaskFieldRef to fetch.
     */
    where?: ComputedTaskFieldRefWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ComputedTaskFieldRefs to fetch.
     */
    orderBy?: ComputedTaskFieldRefOrderByWithRelationInput | ComputedTaskFieldRefOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for ComputedTaskFieldRefs.
     */
    cursor?: ComputedTaskFieldRefWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ComputedTaskFieldRefs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ComputedTaskFieldRefs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of ComputedTaskFieldRefs.
     */
    distinct?: ComputedTaskFieldRefScalarFieldEnum | ComputedTaskFieldRefScalarFieldEnum[]
  }

  /**
   * ComputedTaskFieldRef findMany
   */
  export type ComputedTaskFieldRefFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedTaskFieldRef
     */
    select?: ComputedTaskFieldRefSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedTaskFieldRef
     */
    omit?: ComputedTaskFieldRefOmit<ExtArgs> | null
    /**
     * Filter, which ComputedTaskFieldRefs to fetch.
     */
    where?: ComputedTaskFieldRefWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ComputedTaskFieldRefs to fetch.
     */
    orderBy?: ComputedTaskFieldRefOrderByWithRelationInput | ComputedTaskFieldRefOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing ComputedTaskFieldRefs.
     */
    cursor?: ComputedTaskFieldRefWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ComputedTaskFieldRefs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ComputedTaskFieldRefs.
     */
    skip?: number
    distinct?: ComputedTaskFieldRefScalarFieldEnum | ComputedTaskFieldRefScalarFieldEnum[]
  }

  /**
   * ComputedTaskFieldRef create
   */
  export type ComputedTaskFieldRefCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedTaskFieldRef
     */
    select?: ComputedTaskFieldRefSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedTaskFieldRef
     */
    omit?: ComputedTaskFieldRefOmit<ExtArgs> | null
    /**
     * The data needed to create a ComputedTaskFieldRef.
     */
    data: XOR<ComputedTaskFieldRefCreateInput, ComputedTaskFieldRefUncheckedCreateInput>
  }

  /**
   * ComputedTaskFieldRef createMany
   */
  export type ComputedTaskFieldRefCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many ComputedTaskFieldRefs.
     */
    data: ComputedTaskFieldRefCreateManyInput | ComputedTaskFieldRefCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * ComputedTaskFieldRef createManyAndReturn
   */
  export type ComputedTaskFieldRefCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedTaskFieldRef
     */
    select?: ComputedTaskFieldRefSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedTaskFieldRef
     */
    omit?: ComputedTaskFieldRefOmit<ExtArgs> | null
    /**
     * The data used to create many ComputedTaskFieldRefs.
     */
    data: ComputedTaskFieldRefCreateManyInput | ComputedTaskFieldRefCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * ComputedTaskFieldRef update
   */
  export type ComputedTaskFieldRefUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedTaskFieldRef
     */
    select?: ComputedTaskFieldRefSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedTaskFieldRef
     */
    omit?: ComputedTaskFieldRefOmit<ExtArgs> | null
    /**
     * The data needed to update a ComputedTaskFieldRef.
     */
    data: XOR<ComputedTaskFieldRefUpdateInput, ComputedTaskFieldRefUncheckedUpdateInput>
    /**
     * Choose, which ComputedTaskFieldRef to update.
     */
    where: ComputedTaskFieldRefWhereUniqueInput
  }

  /**
   * ComputedTaskFieldRef updateMany
   */
  export type ComputedTaskFieldRefUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update ComputedTaskFieldRefs.
     */
    data: XOR<ComputedTaskFieldRefUpdateManyMutationInput, ComputedTaskFieldRefUncheckedUpdateManyInput>
    /**
     * Filter which ComputedTaskFieldRefs to update
     */
    where?: ComputedTaskFieldRefWhereInput
  }

  /**
   * ComputedTaskFieldRef updateManyAndReturn
   */
  export type ComputedTaskFieldRefUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedTaskFieldRef
     */
    select?: ComputedTaskFieldRefSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedTaskFieldRef
     */
    omit?: ComputedTaskFieldRefOmit<ExtArgs> | null
    /**
     * The data used to update ComputedTaskFieldRefs.
     */
    data: XOR<ComputedTaskFieldRefUpdateManyMutationInput, ComputedTaskFieldRefUncheckedUpdateManyInput>
    /**
     * Filter which ComputedTaskFieldRefs to update
     */
    where?: ComputedTaskFieldRefWhereInput
  }

  /**
   * ComputedTaskFieldRef upsert
   */
  export type ComputedTaskFieldRefUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedTaskFieldRef
     */
    select?: ComputedTaskFieldRefSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedTaskFieldRef
     */
    omit?: ComputedTaskFieldRefOmit<ExtArgs> | null
    /**
     * The filter to search for the ComputedTaskFieldRef to update in case it exists.
     */
    where: ComputedTaskFieldRefWhereUniqueInput
    /**
     * In case the ComputedTaskFieldRef found by the `where` argument doesn't exist, create a new ComputedTaskFieldRef with this data.
     */
    create: XOR<ComputedTaskFieldRefCreateInput, ComputedTaskFieldRefUncheckedCreateInput>
    /**
     * In case the ComputedTaskFieldRef was found with the provided `where` argument, update it with this data.
     */
    update: XOR<ComputedTaskFieldRefUpdateInput, ComputedTaskFieldRefUncheckedUpdateInput>
  }

  /**
   * ComputedTaskFieldRef delete
   */
  export type ComputedTaskFieldRefDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedTaskFieldRef
     */
    select?: ComputedTaskFieldRefSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedTaskFieldRef
     */
    omit?: ComputedTaskFieldRefOmit<ExtArgs> | null
    /**
     * Filter which ComputedTaskFieldRef to delete.
     */
    where: ComputedTaskFieldRefWhereUniqueInput
  }

  /**
   * ComputedTaskFieldRef deleteMany
   */
  export type ComputedTaskFieldRefDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which ComputedTaskFieldRefs to delete
     */
    where?: ComputedTaskFieldRefWhereInput
  }

  /**
   * ComputedTaskFieldRef without action
   */
  export type ComputedTaskFieldRefDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ComputedTaskFieldRef
     */
    select?: ComputedTaskFieldRefSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ComputedTaskFieldRef
     */
    omit?: ComputedTaskFieldRefOmit<ExtArgs> | null
  }


  /**
   * Model RecordHistory
   */

  export type AggregateRecordHistory = {
    _count: RecordHistoryCountAggregateOutputType | null
    _min: RecordHistoryMinAggregateOutputType | null
    _max: RecordHistoryMaxAggregateOutputType | null
  }

  export type RecordHistoryMinAggregateOutputType = {
    id: string | null
    tableId: string | null
    recordId: string | null
    fieldId: string | null
    before: string | null
    after: string | null
    createdTime: Date | null
    createdBy: string | null
  }

  export type RecordHistoryMaxAggregateOutputType = {
    id: string | null
    tableId: string | null
    recordId: string | null
    fieldId: string | null
    before: string | null
    after: string | null
    createdTime: Date | null
    createdBy: string | null
  }

  export type RecordHistoryCountAggregateOutputType = {
    id: number
    tableId: number
    recordId: number
    fieldId: number
    before: number
    after: number
    createdTime: number
    createdBy: number
    _all: number
  }


  export type RecordHistoryMinAggregateInputType = {
    id?: true
    tableId?: true
    recordId?: true
    fieldId?: true
    before?: true
    after?: true
    createdTime?: true
    createdBy?: true
  }

  export type RecordHistoryMaxAggregateInputType = {
    id?: true
    tableId?: true
    recordId?: true
    fieldId?: true
    before?: true
    after?: true
    createdTime?: true
    createdBy?: true
  }

  export type RecordHistoryCountAggregateInputType = {
    id?: true
    tableId?: true
    recordId?: true
    fieldId?: true
    before?: true
    after?: true
    createdTime?: true
    createdBy?: true
    _all?: true
  }

  export type RecordHistoryAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which RecordHistory to aggregate.
     */
    where?: RecordHistoryWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of RecordHistories to fetch.
     */
    orderBy?: RecordHistoryOrderByWithRelationInput | RecordHistoryOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: RecordHistoryWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` RecordHistories from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` RecordHistories.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned RecordHistories
    **/
    _count?: true | RecordHistoryCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: RecordHistoryMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: RecordHistoryMaxAggregateInputType
  }

  export type GetRecordHistoryAggregateType<T extends RecordHistoryAggregateArgs> = {
        [P in keyof T & keyof AggregateRecordHistory]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateRecordHistory[P]>
      : GetScalarType<T[P], AggregateRecordHistory[P]>
  }




  export type RecordHistoryGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: RecordHistoryWhereInput
    orderBy?: RecordHistoryOrderByWithAggregationInput | RecordHistoryOrderByWithAggregationInput[]
    by: RecordHistoryScalarFieldEnum[] | RecordHistoryScalarFieldEnum
    having?: RecordHistoryScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: RecordHistoryCountAggregateInputType | true
    _min?: RecordHistoryMinAggregateInputType
    _max?: RecordHistoryMaxAggregateInputType
  }

  export type RecordHistoryGroupByOutputType = {
    id: string
    tableId: string
    recordId: string
    fieldId: string
    before: string
    after: string
    createdTime: Date
    createdBy: string
    _count: RecordHistoryCountAggregateOutputType | null
    _min: RecordHistoryMinAggregateOutputType | null
    _max: RecordHistoryMaxAggregateOutputType | null
  }

  type GetRecordHistoryGroupByPayload<T extends RecordHistoryGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<RecordHistoryGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof RecordHistoryGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], RecordHistoryGroupByOutputType[P]>
            : GetScalarType<T[P], RecordHistoryGroupByOutputType[P]>
        }
      >
    >


  export type RecordHistorySelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    tableId?: boolean
    recordId?: boolean
    fieldId?: boolean
    before?: boolean
    after?: boolean
    createdTime?: boolean
    createdBy?: boolean
  }, ExtArgs["result"]["recordHistory"]>

  export type RecordHistorySelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    tableId?: boolean
    recordId?: boolean
    fieldId?: boolean
    before?: boolean
    after?: boolean
    createdTime?: boolean
    createdBy?: boolean
  }, ExtArgs["result"]["recordHistory"]>

  export type RecordHistorySelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    tableId?: boolean
    recordId?: boolean
    fieldId?: boolean
    before?: boolean
    after?: boolean
    createdTime?: boolean
    createdBy?: boolean
  }, ExtArgs["result"]["recordHistory"]>

  export type RecordHistorySelectScalar = {
    id?: boolean
    tableId?: boolean
    recordId?: boolean
    fieldId?: boolean
    before?: boolean
    after?: boolean
    createdTime?: boolean
    createdBy?: boolean
  }

  export type RecordHistoryOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "tableId" | "recordId" | "fieldId" | "before" | "after" | "createdTime" | "createdBy", ExtArgs["result"]["recordHistory"]>

  export type $RecordHistoryPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "RecordHistory"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      tableId: string
      recordId: string
      fieldId: string
      before: string
      after: string
      createdTime: Date
      createdBy: string
    }, ExtArgs["result"]["recordHistory"]>
    composites: {}
  }

  type RecordHistoryGetPayload<S extends boolean | null | undefined | RecordHistoryDefaultArgs> = $Result.GetResult<Prisma.$RecordHistoryPayload, S>

  type RecordHistoryCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<RecordHistoryFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: RecordHistoryCountAggregateInputType | true
    }

  export interface RecordHistoryDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['RecordHistory'], meta: { name: 'RecordHistory' } }
    /**
     * Find zero or one RecordHistory that matches the filter.
     * @param {RecordHistoryFindUniqueArgs} args - Arguments to find a RecordHistory
     * @example
     * // Get one RecordHistory
     * const recordHistory = await prisma.recordHistory.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends RecordHistoryFindUniqueArgs>(args: SelectSubset<T, RecordHistoryFindUniqueArgs<ExtArgs>>): Prisma__RecordHistoryClient<$Result.GetResult<Prisma.$RecordHistoryPayload<ExtArgs>, T, "findUnique", ClientOptions> | null, null, ExtArgs, ClientOptions>

    /**
     * Find one RecordHistory that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {RecordHistoryFindUniqueOrThrowArgs} args - Arguments to find a RecordHistory
     * @example
     * // Get one RecordHistory
     * const recordHistory = await prisma.recordHistory.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends RecordHistoryFindUniqueOrThrowArgs>(args: SelectSubset<T, RecordHistoryFindUniqueOrThrowArgs<ExtArgs>>): Prisma__RecordHistoryClient<$Result.GetResult<Prisma.$RecordHistoryPayload<ExtArgs>, T, "findUniqueOrThrow", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Find the first RecordHistory that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RecordHistoryFindFirstArgs} args - Arguments to find a RecordHistory
     * @example
     * // Get one RecordHistory
     * const recordHistory = await prisma.recordHistory.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends RecordHistoryFindFirstArgs>(args?: SelectSubset<T, RecordHistoryFindFirstArgs<ExtArgs>>): Prisma__RecordHistoryClient<$Result.GetResult<Prisma.$RecordHistoryPayload<ExtArgs>, T, "findFirst", ClientOptions> | null, null, ExtArgs, ClientOptions>

    /**
     * Find the first RecordHistory that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RecordHistoryFindFirstOrThrowArgs} args - Arguments to find a RecordHistory
     * @example
     * // Get one RecordHistory
     * const recordHistory = await prisma.recordHistory.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends RecordHistoryFindFirstOrThrowArgs>(args?: SelectSubset<T, RecordHistoryFindFirstOrThrowArgs<ExtArgs>>): Prisma__RecordHistoryClient<$Result.GetResult<Prisma.$RecordHistoryPayload<ExtArgs>, T, "findFirstOrThrow", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Find zero or more RecordHistories that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RecordHistoryFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all RecordHistories
     * const recordHistories = await prisma.recordHistory.findMany()
     * 
     * // Get first 10 RecordHistories
     * const recordHistories = await prisma.recordHistory.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const recordHistoryWithIdOnly = await prisma.recordHistory.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends RecordHistoryFindManyArgs>(args?: SelectSubset<T, RecordHistoryFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$RecordHistoryPayload<ExtArgs>, T, "findMany", ClientOptions>>

    /**
     * Create a RecordHistory.
     * @param {RecordHistoryCreateArgs} args - Arguments to create a RecordHistory.
     * @example
     * // Create one RecordHistory
     * const RecordHistory = await prisma.recordHistory.create({
     *   data: {
     *     // ... data to create a RecordHistory
     *   }
     * })
     * 
     */
    create<T extends RecordHistoryCreateArgs>(args: SelectSubset<T, RecordHistoryCreateArgs<ExtArgs>>): Prisma__RecordHistoryClient<$Result.GetResult<Prisma.$RecordHistoryPayload<ExtArgs>, T, "create", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Create many RecordHistories.
     * @param {RecordHistoryCreateManyArgs} args - Arguments to create many RecordHistories.
     * @example
     * // Create many RecordHistories
     * const recordHistory = await prisma.recordHistory.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends RecordHistoryCreateManyArgs>(args?: SelectSubset<T, RecordHistoryCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many RecordHistories and returns the data saved in the database.
     * @param {RecordHistoryCreateManyAndReturnArgs} args - Arguments to create many RecordHistories.
     * @example
     * // Create many RecordHistories
     * const recordHistory = await prisma.recordHistory.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many RecordHistories and only return the `id`
     * const recordHistoryWithIdOnly = await prisma.recordHistory.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends RecordHistoryCreateManyAndReturnArgs>(args?: SelectSubset<T, RecordHistoryCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$RecordHistoryPayload<ExtArgs>, T, "createManyAndReturn", ClientOptions>>

    /**
     * Delete a RecordHistory.
     * @param {RecordHistoryDeleteArgs} args - Arguments to delete one RecordHistory.
     * @example
     * // Delete one RecordHistory
     * const RecordHistory = await prisma.recordHistory.delete({
     *   where: {
     *     // ... filter to delete one RecordHistory
     *   }
     * })
     * 
     */
    delete<T extends RecordHistoryDeleteArgs>(args: SelectSubset<T, RecordHistoryDeleteArgs<ExtArgs>>): Prisma__RecordHistoryClient<$Result.GetResult<Prisma.$RecordHistoryPayload<ExtArgs>, T, "delete", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Update one RecordHistory.
     * @param {RecordHistoryUpdateArgs} args - Arguments to update one RecordHistory.
     * @example
     * // Update one RecordHistory
     * const recordHistory = await prisma.recordHistory.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends RecordHistoryUpdateArgs>(args: SelectSubset<T, RecordHistoryUpdateArgs<ExtArgs>>): Prisma__RecordHistoryClient<$Result.GetResult<Prisma.$RecordHistoryPayload<ExtArgs>, T, "update", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Delete zero or more RecordHistories.
     * @param {RecordHistoryDeleteManyArgs} args - Arguments to filter RecordHistories to delete.
     * @example
     * // Delete a few RecordHistories
     * const { count } = await prisma.recordHistory.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends RecordHistoryDeleteManyArgs>(args?: SelectSubset<T, RecordHistoryDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more RecordHistories.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RecordHistoryUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many RecordHistories
     * const recordHistory = await prisma.recordHistory.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends RecordHistoryUpdateManyArgs>(args: SelectSubset<T, RecordHistoryUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more RecordHistories and returns the data updated in the database.
     * @param {RecordHistoryUpdateManyAndReturnArgs} args - Arguments to update many RecordHistories.
     * @example
     * // Update many RecordHistories
     * const recordHistory = await prisma.recordHistory.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more RecordHistories and only return the `id`
     * const recordHistoryWithIdOnly = await prisma.recordHistory.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends RecordHistoryUpdateManyAndReturnArgs>(args: SelectSubset<T, RecordHistoryUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$RecordHistoryPayload<ExtArgs>, T, "updateManyAndReturn", ClientOptions>>

    /**
     * Create or update one RecordHistory.
     * @param {RecordHistoryUpsertArgs} args - Arguments to update or create a RecordHistory.
     * @example
     * // Update or create a RecordHistory
     * const recordHistory = await prisma.recordHistory.upsert({
     *   create: {
     *     // ... data to create a RecordHistory
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the RecordHistory we want to update
     *   }
     * })
     */
    upsert<T extends RecordHistoryUpsertArgs>(args: SelectSubset<T, RecordHistoryUpsertArgs<ExtArgs>>): Prisma__RecordHistoryClient<$Result.GetResult<Prisma.$RecordHistoryPayload<ExtArgs>, T, "upsert", ClientOptions>, never, ExtArgs, ClientOptions>


    /**
     * Count the number of RecordHistories.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RecordHistoryCountArgs} args - Arguments to filter RecordHistories to count.
     * @example
     * // Count the number of RecordHistories
     * const count = await prisma.recordHistory.count({
     *   where: {
     *     // ... the filter for the RecordHistories we want to count
     *   }
     * })
    **/
    count<T extends RecordHistoryCountArgs>(
      args?: Subset<T, RecordHistoryCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], RecordHistoryCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a RecordHistory.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RecordHistoryAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends RecordHistoryAggregateArgs>(args: Subset<T, RecordHistoryAggregateArgs>): Prisma.PrismaPromise<GetRecordHistoryAggregateType<T>>

    /**
     * Group by RecordHistory.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RecordHistoryGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends RecordHistoryGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: RecordHistoryGroupByArgs['orderBy'] }
        : { orderBy?: RecordHistoryGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, RecordHistoryGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetRecordHistoryGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the RecordHistory model
   */
  readonly fields: RecordHistoryFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for RecordHistory.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__RecordHistoryClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the RecordHistory model
   */ 
  interface RecordHistoryFieldRefs {
    readonly id: FieldRef<"RecordHistory", 'String'>
    readonly tableId: FieldRef<"RecordHistory", 'String'>
    readonly recordId: FieldRef<"RecordHistory", 'String'>
    readonly fieldId: FieldRef<"RecordHistory", 'String'>
    readonly before: FieldRef<"RecordHistory", 'String'>
    readonly after: FieldRef<"RecordHistory", 'String'>
    readonly createdTime: FieldRef<"RecordHistory", 'DateTime'>
    readonly createdBy: FieldRef<"RecordHistory", 'String'>
  }
    

  // Custom InputTypes
  /**
   * RecordHistory findUnique
   */
  export type RecordHistoryFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RecordHistory
     */
    select?: RecordHistorySelect<ExtArgs> | null
    /**
     * Omit specific fields from the RecordHistory
     */
    omit?: RecordHistoryOmit<ExtArgs> | null
    /**
     * Filter, which RecordHistory to fetch.
     */
    where: RecordHistoryWhereUniqueInput
  }

  /**
   * RecordHistory findUniqueOrThrow
   */
  export type RecordHistoryFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RecordHistory
     */
    select?: RecordHistorySelect<ExtArgs> | null
    /**
     * Omit specific fields from the RecordHistory
     */
    omit?: RecordHistoryOmit<ExtArgs> | null
    /**
     * Filter, which RecordHistory to fetch.
     */
    where: RecordHistoryWhereUniqueInput
  }

  /**
   * RecordHistory findFirst
   */
  export type RecordHistoryFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RecordHistory
     */
    select?: RecordHistorySelect<ExtArgs> | null
    /**
     * Omit specific fields from the RecordHistory
     */
    omit?: RecordHistoryOmit<ExtArgs> | null
    /**
     * Filter, which RecordHistory to fetch.
     */
    where?: RecordHistoryWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of RecordHistories to fetch.
     */
    orderBy?: RecordHistoryOrderByWithRelationInput | RecordHistoryOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for RecordHistories.
     */
    cursor?: RecordHistoryWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` RecordHistories from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` RecordHistories.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of RecordHistories.
     */
    distinct?: RecordHistoryScalarFieldEnum | RecordHistoryScalarFieldEnum[]
  }

  /**
   * RecordHistory findFirstOrThrow
   */
  export type RecordHistoryFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RecordHistory
     */
    select?: RecordHistorySelect<ExtArgs> | null
    /**
     * Omit specific fields from the RecordHistory
     */
    omit?: RecordHistoryOmit<ExtArgs> | null
    /**
     * Filter, which RecordHistory to fetch.
     */
    where?: RecordHistoryWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of RecordHistories to fetch.
     */
    orderBy?: RecordHistoryOrderByWithRelationInput | RecordHistoryOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for RecordHistories.
     */
    cursor?: RecordHistoryWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` RecordHistories from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` RecordHistories.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of RecordHistories.
     */
    distinct?: RecordHistoryScalarFieldEnum | RecordHistoryScalarFieldEnum[]
  }

  /**
   * RecordHistory findMany
   */
  export type RecordHistoryFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RecordHistory
     */
    select?: RecordHistorySelect<ExtArgs> | null
    /**
     * Omit specific fields from the RecordHistory
     */
    omit?: RecordHistoryOmit<ExtArgs> | null
    /**
     * Filter, which RecordHistories to fetch.
     */
    where?: RecordHistoryWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of RecordHistories to fetch.
     */
    orderBy?: RecordHistoryOrderByWithRelationInput | RecordHistoryOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing RecordHistories.
     */
    cursor?: RecordHistoryWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` RecordHistories from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` RecordHistories.
     */
    skip?: number
    distinct?: RecordHistoryScalarFieldEnum | RecordHistoryScalarFieldEnum[]
  }

  /**
   * RecordHistory create
   */
  export type RecordHistoryCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RecordHistory
     */
    select?: RecordHistorySelect<ExtArgs> | null
    /**
     * Omit specific fields from the RecordHistory
     */
    omit?: RecordHistoryOmit<ExtArgs> | null
    /**
     * The data needed to create a RecordHistory.
     */
    data: XOR<RecordHistoryCreateInput, RecordHistoryUncheckedCreateInput>
  }

  /**
   * RecordHistory createMany
   */
  export type RecordHistoryCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many RecordHistories.
     */
    data: RecordHistoryCreateManyInput | RecordHistoryCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * RecordHistory createManyAndReturn
   */
  export type RecordHistoryCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RecordHistory
     */
    select?: RecordHistorySelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the RecordHistory
     */
    omit?: RecordHistoryOmit<ExtArgs> | null
    /**
     * The data used to create many RecordHistories.
     */
    data: RecordHistoryCreateManyInput | RecordHistoryCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * RecordHistory update
   */
  export type RecordHistoryUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RecordHistory
     */
    select?: RecordHistorySelect<ExtArgs> | null
    /**
     * Omit specific fields from the RecordHistory
     */
    omit?: RecordHistoryOmit<ExtArgs> | null
    /**
     * The data needed to update a RecordHistory.
     */
    data: XOR<RecordHistoryUpdateInput, RecordHistoryUncheckedUpdateInput>
    /**
     * Choose, which RecordHistory to update.
     */
    where: RecordHistoryWhereUniqueInput
  }

  /**
   * RecordHistory updateMany
   */
  export type RecordHistoryUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update RecordHistories.
     */
    data: XOR<RecordHistoryUpdateManyMutationInput, RecordHistoryUncheckedUpdateManyInput>
    /**
     * Filter which RecordHistories to update
     */
    where?: RecordHistoryWhereInput
  }

  /**
   * RecordHistory updateManyAndReturn
   */
  export type RecordHistoryUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RecordHistory
     */
    select?: RecordHistorySelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the RecordHistory
     */
    omit?: RecordHistoryOmit<ExtArgs> | null
    /**
     * The data used to update RecordHistories.
     */
    data: XOR<RecordHistoryUpdateManyMutationInput, RecordHistoryUncheckedUpdateManyInput>
    /**
     * Filter which RecordHistories to update
     */
    where?: RecordHistoryWhereInput
  }

  /**
   * RecordHistory upsert
   */
  export type RecordHistoryUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RecordHistory
     */
    select?: RecordHistorySelect<ExtArgs> | null
    /**
     * Omit specific fields from the RecordHistory
     */
    omit?: RecordHistoryOmit<ExtArgs> | null
    /**
     * The filter to search for the RecordHistory to update in case it exists.
     */
    where: RecordHistoryWhereUniqueInput
    /**
     * In case the RecordHistory found by the `where` argument doesn't exist, create a new RecordHistory with this data.
     */
    create: XOR<RecordHistoryCreateInput, RecordHistoryUncheckedCreateInput>
    /**
     * In case the RecordHistory was found with the provided `where` argument, update it with this data.
     */
    update: XOR<RecordHistoryUpdateInput, RecordHistoryUncheckedUpdateInput>
  }

  /**
   * RecordHistory delete
   */
  export type RecordHistoryDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RecordHistory
     */
    select?: RecordHistorySelect<ExtArgs> | null
    /**
     * Omit specific fields from the RecordHistory
     */
    omit?: RecordHistoryOmit<ExtArgs> | null
    /**
     * Filter which RecordHistory to delete.
     */
    where: RecordHistoryWhereUniqueInput
  }

  /**
   * RecordHistory deleteMany
   */
  export type RecordHistoryDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which RecordHistories to delete
     */
    where?: RecordHistoryWhereInput
  }

  /**
   * RecordHistory without action
   */
  export type RecordHistoryDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RecordHistory
     */
    select?: RecordHistorySelect<ExtArgs> | null
    /**
     * Omit specific fields from the RecordHistory
     */
    omit?: RecordHistoryOmit<ExtArgs> | null
  }


  /**
   * Model TableTrash
   */

  export type AggregateTableTrash = {
    _count: TableTrashCountAggregateOutputType | null
    _min: TableTrashMinAggregateOutputType | null
    _max: TableTrashMaxAggregateOutputType | null
  }

  export type TableTrashMinAggregateOutputType = {
    id: string | null
    tableId: string | null
    resourceType: string | null
    snapshot: string | null
    createdTime: Date | null
    createdBy: string | null
  }

  export type TableTrashMaxAggregateOutputType = {
    id: string | null
    tableId: string | null
    resourceType: string | null
    snapshot: string | null
    createdTime: Date | null
    createdBy: string | null
  }

  export type TableTrashCountAggregateOutputType = {
    id: number
    tableId: number
    resourceType: number
    snapshot: number
    createdTime: number
    createdBy: number
    _all: number
  }


  export type TableTrashMinAggregateInputType = {
    id?: true
    tableId?: true
    resourceType?: true
    snapshot?: true
    createdTime?: true
    createdBy?: true
  }

  export type TableTrashMaxAggregateInputType = {
    id?: true
    tableId?: true
    resourceType?: true
    snapshot?: true
    createdTime?: true
    createdBy?: true
  }

  export type TableTrashCountAggregateInputType = {
    id?: true
    tableId?: true
    resourceType?: true
    snapshot?: true
    createdTime?: true
    createdBy?: true
    _all?: true
  }

  export type TableTrashAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which TableTrash to aggregate.
     */
    where?: TableTrashWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of TableTrashes to fetch.
     */
    orderBy?: TableTrashOrderByWithRelationInput | TableTrashOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: TableTrashWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` TableTrashes from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` TableTrashes.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned TableTrashes
    **/
    _count?: true | TableTrashCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: TableTrashMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: TableTrashMaxAggregateInputType
  }

  export type GetTableTrashAggregateType<T extends TableTrashAggregateArgs> = {
        [P in keyof T & keyof AggregateTableTrash]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateTableTrash[P]>
      : GetScalarType<T[P], AggregateTableTrash[P]>
  }




  export type TableTrashGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: TableTrashWhereInput
    orderBy?: TableTrashOrderByWithAggregationInput | TableTrashOrderByWithAggregationInput[]
    by: TableTrashScalarFieldEnum[] | TableTrashScalarFieldEnum
    having?: TableTrashScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: TableTrashCountAggregateInputType | true
    _min?: TableTrashMinAggregateInputType
    _max?: TableTrashMaxAggregateInputType
  }

  export type TableTrashGroupByOutputType = {
    id: string
    tableId: string
    resourceType: string
    snapshot: string
    createdTime: Date
    createdBy: string
    _count: TableTrashCountAggregateOutputType | null
    _min: TableTrashMinAggregateOutputType | null
    _max: TableTrashMaxAggregateOutputType | null
  }

  type GetTableTrashGroupByPayload<T extends TableTrashGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<TableTrashGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof TableTrashGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], TableTrashGroupByOutputType[P]>
            : GetScalarType<T[P], TableTrashGroupByOutputType[P]>
        }
      >
    >


  export type TableTrashSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    tableId?: boolean
    resourceType?: boolean
    snapshot?: boolean
    createdTime?: boolean
    createdBy?: boolean
  }, ExtArgs["result"]["tableTrash"]>

  export type TableTrashSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    tableId?: boolean
    resourceType?: boolean
    snapshot?: boolean
    createdTime?: boolean
    createdBy?: boolean
  }, ExtArgs["result"]["tableTrash"]>

  export type TableTrashSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    tableId?: boolean
    resourceType?: boolean
    snapshot?: boolean
    createdTime?: boolean
    createdBy?: boolean
  }, ExtArgs["result"]["tableTrash"]>

  export type TableTrashSelectScalar = {
    id?: boolean
    tableId?: boolean
    resourceType?: boolean
    snapshot?: boolean
    createdTime?: boolean
    createdBy?: boolean
  }

  export type TableTrashOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "tableId" | "resourceType" | "snapshot" | "createdTime" | "createdBy", ExtArgs["result"]["tableTrash"]>

  export type $TableTrashPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "TableTrash"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      tableId: string
      resourceType: string
      snapshot: string
      createdTime: Date
      createdBy: string
    }, ExtArgs["result"]["tableTrash"]>
    composites: {}
  }

  type TableTrashGetPayload<S extends boolean | null | undefined | TableTrashDefaultArgs> = $Result.GetResult<Prisma.$TableTrashPayload, S>

  type TableTrashCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<TableTrashFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: TableTrashCountAggregateInputType | true
    }

  export interface TableTrashDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['TableTrash'], meta: { name: 'TableTrash' } }
    /**
     * Find zero or one TableTrash that matches the filter.
     * @param {TableTrashFindUniqueArgs} args - Arguments to find a TableTrash
     * @example
     * // Get one TableTrash
     * const tableTrash = await prisma.tableTrash.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends TableTrashFindUniqueArgs>(args: SelectSubset<T, TableTrashFindUniqueArgs<ExtArgs>>): Prisma__TableTrashClient<$Result.GetResult<Prisma.$TableTrashPayload<ExtArgs>, T, "findUnique", ClientOptions> | null, null, ExtArgs, ClientOptions>

    /**
     * Find one TableTrash that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {TableTrashFindUniqueOrThrowArgs} args - Arguments to find a TableTrash
     * @example
     * // Get one TableTrash
     * const tableTrash = await prisma.tableTrash.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends TableTrashFindUniqueOrThrowArgs>(args: SelectSubset<T, TableTrashFindUniqueOrThrowArgs<ExtArgs>>): Prisma__TableTrashClient<$Result.GetResult<Prisma.$TableTrashPayload<ExtArgs>, T, "findUniqueOrThrow", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Find the first TableTrash that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TableTrashFindFirstArgs} args - Arguments to find a TableTrash
     * @example
     * // Get one TableTrash
     * const tableTrash = await prisma.tableTrash.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends TableTrashFindFirstArgs>(args?: SelectSubset<T, TableTrashFindFirstArgs<ExtArgs>>): Prisma__TableTrashClient<$Result.GetResult<Prisma.$TableTrashPayload<ExtArgs>, T, "findFirst", ClientOptions> | null, null, ExtArgs, ClientOptions>

    /**
     * Find the first TableTrash that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TableTrashFindFirstOrThrowArgs} args - Arguments to find a TableTrash
     * @example
     * // Get one TableTrash
     * const tableTrash = await prisma.tableTrash.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends TableTrashFindFirstOrThrowArgs>(args?: SelectSubset<T, TableTrashFindFirstOrThrowArgs<ExtArgs>>): Prisma__TableTrashClient<$Result.GetResult<Prisma.$TableTrashPayload<ExtArgs>, T, "findFirstOrThrow", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Find zero or more TableTrashes that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TableTrashFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all TableTrashes
     * const tableTrashes = await prisma.tableTrash.findMany()
     * 
     * // Get first 10 TableTrashes
     * const tableTrashes = await prisma.tableTrash.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const tableTrashWithIdOnly = await prisma.tableTrash.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends TableTrashFindManyArgs>(args?: SelectSubset<T, TableTrashFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TableTrashPayload<ExtArgs>, T, "findMany", ClientOptions>>

    /**
     * Create a TableTrash.
     * @param {TableTrashCreateArgs} args - Arguments to create a TableTrash.
     * @example
     * // Create one TableTrash
     * const TableTrash = await prisma.tableTrash.create({
     *   data: {
     *     // ... data to create a TableTrash
     *   }
     * })
     * 
     */
    create<T extends TableTrashCreateArgs>(args: SelectSubset<T, TableTrashCreateArgs<ExtArgs>>): Prisma__TableTrashClient<$Result.GetResult<Prisma.$TableTrashPayload<ExtArgs>, T, "create", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Create many TableTrashes.
     * @param {TableTrashCreateManyArgs} args - Arguments to create many TableTrashes.
     * @example
     * // Create many TableTrashes
     * const tableTrash = await prisma.tableTrash.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends TableTrashCreateManyArgs>(args?: SelectSubset<T, TableTrashCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many TableTrashes and returns the data saved in the database.
     * @param {TableTrashCreateManyAndReturnArgs} args - Arguments to create many TableTrashes.
     * @example
     * // Create many TableTrashes
     * const tableTrash = await prisma.tableTrash.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many TableTrashes and only return the `id`
     * const tableTrashWithIdOnly = await prisma.tableTrash.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends TableTrashCreateManyAndReturnArgs>(args?: SelectSubset<T, TableTrashCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TableTrashPayload<ExtArgs>, T, "createManyAndReturn", ClientOptions>>

    /**
     * Delete a TableTrash.
     * @param {TableTrashDeleteArgs} args - Arguments to delete one TableTrash.
     * @example
     * // Delete one TableTrash
     * const TableTrash = await prisma.tableTrash.delete({
     *   where: {
     *     // ... filter to delete one TableTrash
     *   }
     * })
     * 
     */
    delete<T extends TableTrashDeleteArgs>(args: SelectSubset<T, TableTrashDeleteArgs<ExtArgs>>): Prisma__TableTrashClient<$Result.GetResult<Prisma.$TableTrashPayload<ExtArgs>, T, "delete", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Update one TableTrash.
     * @param {TableTrashUpdateArgs} args - Arguments to update one TableTrash.
     * @example
     * // Update one TableTrash
     * const tableTrash = await prisma.tableTrash.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends TableTrashUpdateArgs>(args: SelectSubset<T, TableTrashUpdateArgs<ExtArgs>>): Prisma__TableTrashClient<$Result.GetResult<Prisma.$TableTrashPayload<ExtArgs>, T, "update", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Delete zero or more TableTrashes.
     * @param {TableTrashDeleteManyArgs} args - Arguments to filter TableTrashes to delete.
     * @example
     * // Delete a few TableTrashes
     * const { count } = await prisma.tableTrash.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends TableTrashDeleteManyArgs>(args?: SelectSubset<T, TableTrashDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more TableTrashes.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TableTrashUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many TableTrashes
     * const tableTrash = await prisma.tableTrash.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends TableTrashUpdateManyArgs>(args: SelectSubset<T, TableTrashUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more TableTrashes and returns the data updated in the database.
     * @param {TableTrashUpdateManyAndReturnArgs} args - Arguments to update many TableTrashes.
     * @example
     * // Update many TableTrashes
     * const tableTrash = await prisma.tableTrash.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more TableTrashes and only return the `id`
     * const tableTrashWithIdOnly = await prisma.tableTrash.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends TableTrashUpdateManyAndReturnArgs>(args: SelectSubset<T, TableTrashUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TableTrashPayload<ExtArgs>, T, "updateManyAndReturn", ClientOptions>>

    /**
     * Create or update one TableTrash.
     * @param {TableTrashUpsertArgs} args - Arguments to update or create a TableTrash.
     * @example
     * // Update or create a TableTrash
     * const tableTrash = await prisma.tableTrash.upsert({
     *   create: {
     *     // ... data to create a TableTrash
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the TableTrash we want to update
     *   }
     * })
     */
    upsert<T extends TableTrashUpsertArgs>(args: SelectSubset<T, TableTrashUpsertArgs<ExtArgs>>): Prisma__TableTrashClient<$Result.GetResult<Prisma.$TableTrashPayload<ExtArgs>, T, "upsert", ClientOptions>, never, ExtArgs, ClientOptions>


    /**
     * Count the number of TableTrashes.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TableTrashCountArgs} args - Arguments to filter TableTrashes to count.
     * @example
     * // Count the number of TableTrashes
     * const count = await prisma.tableTrash.count({
     *   where: {
     *     // ... the filter for the TableTrashes we want to count
     *   }
     * })
    **/
    count<T extends TableTrashCountArgs>(
      args?: Subset<T, TableTrashCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], TableTrashCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a TableTrash.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TableTrashAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends TableTrashAggregateArgs>(args: Subset<T, TableTrashAggregateArgs>): Prisma.PrismaPromise<GetTableTrashAggregateType<T>>

    /**
     * Group by TableTrash.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TableTrashGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends TableTrashGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: TableTrashGroupByArgs['orderBy'] }
        : { orderBy?: TableTrashGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, TableTrashGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetTableTrashGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the TableTrash model
   */
  readonly fields: TableTrashFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for TableTrash.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__TableTrashClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the TableTrash model
   */ 
  interface TableTrashFieldRefs {
    readonly id: FieldRef<"TableTrash", 'String'>
    readonly tableId: FieldRef<"TableTrash", 'String'>
    readonly resourceType: FieldRef<"TableTrash", 'String'>
    readonly snapshot: FieldRef<"TableTrash", 'String'>
    readonly createdTime: FieldRef<"TableTrash", 'DateTime'>
    readonly createdBy: FieldRef<"TableTrash", 'String'>
  }
    

  // Custom InputTypes
  /**
   * TableTrash findUnique
   */
  export type TableTrashFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TableTrash
     */
    select?: TableTrashSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TableTrash
     */
    omit?: TableTrashOmit<ExtArgs> | null
    /**
     * Filter, which TableTrash to fetch.
     */
    where: TableTrashWhereUniqueInput
  }

  /**
   * TableTrash findUniqueOrThrow
   */
  export type TableTrashFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TableTrash
     */
    select?: TableTrashSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TableTrash
     */
    omit?: TableTrashOmit<ExtArgs> | null
    /**
     * Filter, which TableTrash to fetch.
     */
    where: TableTrashWhereUniqueInput
  }

  /**
   * TableTrash findFirst
   */
  export type TableTrashFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TableTrash
     */
    select?: TableTrashSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TableTrash
     */
    omit?: TableTrashOmit<ExtArgs> | null
    /**
     * Filter, which TableTrash to fetch.
     */
    where?: TableTrashWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of TableTrashes to fetch.
     */
    orderBy?: TableTrashOrderByWithRelationInput | TableTrashOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for TableTrashes.
     */
    cursor?: TableTrashWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` TableTrashes from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` TableTrashes.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of TableTrashes.
     */
    distinct?: TableTrashScalarFieldEnum | TableTrashScalarFieldEnum[]
  }

  /**
   * TableTrash findFirstOrThrow
   */
  export type TableTrashFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TableTrash
     */
    select?: TableTrashSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TableTrash
     */
    omit?: TableTrashOmit<ExtArgs> | null
    /**
     * Filter, which TableTrash to fetch.
     */
    where?: TableTrashWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of TableTrashes to fetch.
     */
    orderBy?: TableTrashOrderByWithRelationInput | TableTrashOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for TableTrashes.
     */
    cursor?: TableTrashWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` TableTrashes from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` TableTrashes.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of TableTrashes.
     */
    distinct?: TableTrashScalarFieldEnum | TableTrashScalarFieldEnum[]
  }

  /**
   * TableTrash findMany
   */
  export type TableTrashFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TableTrash
     */
    select?: TableTrashSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TableTrash
     */
    omit?: TableTrashOmit<ExtArgs> | null
    /**
     * Filter, which TableTrashes to fetch.
     */
    where?: TableTrashWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of TableTrashes to fetch.
     */
    orderBy?: TableTrashOrderByWithRelationInput | TableTrashOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing TableTrashes.
     */
    cursor?: TableTrashWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` TableTrashes from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` TableTrashes.
     */
    skip?: number
    distinct?: TableTrashScalarFieldEnum | TableTrashScalarFieldEnum[]
  }

  /**
   * TableTrash create
   */
  export type TableTrashCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TableTrash
     */
    select?: TableTrashSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TableTrash
     */
    omit?: TableTrashOmit<ExtArgs> | null
    /**
     * The data needed to create a TableTrash.
     */
    data: XOR<TableTrashCreateInput, TableTrashUncheckedCreateInput>
  }

  /**
   * TableTrash createMany
   */
  export type TableTrashCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many TableTrashes.
     */
    data: TableTrashCreateManyInput | TableTrashCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * TableTrash createManyAndReturn
   */
  export type TableTrashCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TableTrash
     */
    select?: TableTrashSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the TableTrash
     */
    omit?: TableTrashOmit<ExtArgs> | null
    /**
     * The data used to create many TableTrashes.
     */
    data: TableTrashCreateManyInput | TableTrashCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * TableTrash update
   */
  export type TableTrashUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TableTrash
     */
    select?: TableTrashSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TableTrash
     */
    omit?: TableTrashOmit<ExtArgs> | null
    /**
     * The data needed to update a TableTrash.
     */
    data: XOR<TableTrashUpdateInput, TableTrashUncheckedUpdateInput>
    /**
     * Choose, which TableTrash to update.
     */
    where: TableTrashWhereUniqueInput
  }

  /**
   * TableTrash updateMany
   */
  export type TableTrashUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update TableTrashes.
     */
    data: XOR<TableTrashUpdateManyMutationInput, TableTrashUncheckedUpdateManyInput>
    /**
     * Filter which TableTrashes to update
     */
    where?: TableTrashWhereInput
  }

  /**
   * TableTrash updateManyAndReturn
   */
  export type TableTrashUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TableTrash
     */
    select?: TableTrashSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the TableTrash
     */
    omit?: TableTrashOmit<ExtArgs> | null
    /**
     * The data used to update TableTrashes.
     */
    data: XOR<TableTrashUpdateManyMutationInput, TableTrashUncheckedUpdateManyInput>
    /**
     * Filter which TableTrashes to update
     */
    where?: TableTrashWhereInput
  }

  /**
   * TableTrash upsert
   */
  export type TableTrashUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TableTrash
     */
    select?: TableTrashSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TableTrash
     */
    omit?: TableTrashOmit<ExtArgs> | null
    /**
     * The filter to search for the TableTrash to update in case it exists.
     */
    where: TableTrashWhereUniqueInput
    /**
     * In case the TableTrash found by the `where` argument doesn't exist, create a new TableTrash with this data.
     */
    create: XOR<TableTrashCreateInput, TableTrashUncheckedCreateInput>
    /**
     * In case the TableTrash was found with the provided `where` argument, update it with this data.
     */
    update: XOR<TableTrashUpdateInput, TableTrashUncheckedUpdateInput>
  }

  /**
   * TableTrash delete
   */
  export type TableTrashDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TableTrash
     */
    select?: TableTrashSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TableTrash
     */
    omit?: TableTrashOmit<ExtArgs> | null
    /**
     * Filter which TableTrash to delete.
     */
    where: TableTrashWhereUniqueInput
  }

  /**
   * TableTrash deleteMany
   */
  export type TableTrashDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which TableTrashes to delete
     */
    where?: TableTrashWhereInput
  }

  /**
   * TableTrash without action
   */
  export type TableTrashDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TableTrash
     */
    select?: TableTrashSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TableTrash
     */
    omit?: TableTrashOmit<ExtArgs> | null
  }


  /**
   * Model RecordTrash
   */

  export type AggregateRecordTrash = {
    _count: RecordTrashCountAggregateOutputType | null
    _min: RecordTrashMinAggregateOutputType | null
    _max: RecordTrashMaxAggregateOutputType | null
  }

  export type RecordTrashMinAggregateOutputType = {
    id: string | null
    tableId: string | null
    recordId: string | null
    snapshot: string | null
    createdTime: Date | null
    createdBy: string | null
  }

  export type RecordTrashMaxAggregateOutputType = {
    id: string | null
    tableId: string | null
    recordId: string | null
    snapshot: string | null
    createdTime: Date | null
    createdBy: string | null
  }

  export type RecordTrashCountAggregateOutputType = {
    id: number
    tableId: number
    recordId: number
    snapshot: number
    createdTime: number
    createdBy: number
    _all: number
  }


  export type RecordTrashMinAggregateInputType = {
    id?: true
    tableId?: true
    recordId?: true
    snapshot?: true
    createdTime?: true
    createdBy?: true
  }

  export type RecordTrashMaxAggregateInputType = {
    id?: true
    tableId?: true
    recordId?: true
    snapshot?: true
    createdTime?: true
    createdBy?: true
  }

  export type RecordTrashCountAggregateInputType = {
    id?: true
    tableId?: true
    recordId?: true
    snapshot?: true
    createdTime?: true
    createdBy?: true
    _all?: true
  }

  export type RecordTrashAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which RecordTrash to aggregate.
     */
    where?: RecordTrashWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of RecordTrashes to fetch.
     */
    orderBy?: RecordTrashOrderByWithRelationInput | RecordTrashOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: RecordTrashWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` RecordTrashes from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` RecordTrashes.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned RecordTrashes
    **/
    _count?: true | RecordTrashCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: RecordTrashMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: RecordTrashMaxAggregateInputType
  }

  export type GetRecordTrashAggregateType<T extends RecordTrashAggregateArgs> = {
        [P in keyof T & keyof AggregateRecordTrash]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateRecordTrash[P]>
      : GetScalarType<T[P], AggregateRecordTrash[P]>
  }




  export type RecordTrashGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: RecordTrashWhereInput
    orderBy?: RecordTrashOrderByWithAggregationInput | RecordTrashOrderByWithAggregationInput[]
    by: RecordTrashScalarFieldEnum[] | RecordTrashScalarFieldEnum
    having?: RecordTrashScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: RecordTrashCountAggregateInputType | true
    _min?: RecordTrashMinAggregateInputType
    _max?: RecordTrashMaxAggregateInputType
  }

  export type RecordTrashGroupByOutputType = {
    id: string
    tableId: string
    recordId: string
    snapshot: string
    createdTime: Date
    createdBy: string
    _count: RecordTrashCountAggregateOutputType | null
    _min: RecordTrashMinAggregateOutputType | null
    _max: RecordTrashMaxAggregateOutputType | null
  }

  type GetRecordTrashGroupByPayload<T extends RecordTrashGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<RecordTrashGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof RecordTrashGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], RecordTrashGroupByOutputType[P]>
            : GetScalarType<T[P], RecordTrashGroupByOutputType[P]>
        }
      >
    >


  export type RecordTrashSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    tableId?: boolean
    recordId?: boolean
    snapshot?: boolean
    createdTime?: boolean
    createdBy?: boolean
  }, ExtArgs["result"]["recordTrash"]>

  export type RecordTrashSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    tableId?: boolean
    recordId?: boolean
    snapshot?: boolean
    createdTime?: boolean
    createdBy?: boolean
  }, ExtArgs["result"]["recordTrash"]>

  export type RecordTrashSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    tableId?: boolean
    recordId?: boolean
    snapshot?: boolean
    createdTime?: boolean
    createdBy?: boolean
  }, ExtArgs["result"]["recordTrash"]>

  export type RecordTrashSelectScalar = {
    id?: boolean
    tableId?: boolean
    recordId?: boolean
    snapshot?: boolean
    createdTime?: boolean
    createdBy?: boolean
  }

  export type RecordTrashOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "tableId" | "recordId" | "snapshot" | "createdTime" | "createdBy", ExtArgs["result"]["recordTrash"]>

  export type $RecordTrashPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "RecordTrash"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      tableId: string
      recordId: string
      snapshot: string
      createdTime: Date
      createdBy: string
    }, ExtArgs["result"]["recordTrash"]>
    composites: {}
  }

  type RecordTrashGetPayload<S extends boolean | null | undefined | RecordTrashDefaultArgs> = $Result.GetResult<Prisma.$RecordTrashPayload, S>

  type RecordTrashCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<RecordTrashFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: RecordTrashCountAggregateInputType | true
    }

  export interface RecordTrashDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['RecordTrash'], meta: { name: 'RecordTrash' } }
    /**
     * Find zero or one RecordTrash that matches the filter.
     * @param {RecordTrashFindUniqueArgs} args - Arguments to find a RecordTrash
     * @example
     * // Get one RecordTrash
     * const recordTrash = await prisma.recordTrash.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends RecordTrashFindUniqueArgs>(args: SelectSubset<T, RecordTrashFindUniqueArgs<ExtArgs>>): Prisma__RecordTrashClient<$Result.GetResult<Prisma.$RecordTrashPayload<ExtArgs>, T, "findUnique", ClientOptions> | null, null, ExtArgs, ClientOptions>

    /**
     * Find one RecordTrash that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {RecordTrashFindUniqueOrThrowArgs} args - Arguments to find a RecordTrash
     * @example
     * // Get one RecordTrash
     * const recordTrash = await prisma.recordTrash.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends RecordTrashFindUniqueOrThrowArgs>(args: SelectSubset<T, RecordTrashFindUniqueOrThrowArgs<ExtArgs>>): Prisma__RecordTrashClient<$Result.GetResult<Prisma.$RecordTrashPayload<ExtArgs>, T, "findUniqueOrThrow", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Find the first RecordTrash that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RecordTrashFindFirstArgs} args - Arguments to find a RecordTrash
     * @example
     * // Get one RecordTrash
     * const recordTrash = await prisma.recordTrash.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends RecordTrashFindFirstArgs>(args?: SelectSubset<T, RecordTrashFindFirstArgs<ExtArgs>>): Prisma__RecordTrashClient<$Result.GetResult<Prisma.$RecordTrashPayload<ExtArgs>, T, "findFirst", ClientOptions> | null, null, ExtArgs, ClientOptions>

    /**
     * Find the first RecordTrash that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RecordTrashFindFirstOrThrowArgs} args - Arguments to find a RecordTrash
     * @example
     * // Get one RecordTrash
     * const recordTrash = await prisma.recordTrash.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends RecordTrashFindFirstOrThrowArgs>(args?: SelectSubset<T, RecordTrashFindFirstOrThrowArgs<ExtArgs>>): Prisma__RecordTrashClient<$Result.GetResult<Prisma.$RecordTrashPayload<ExtArgs>, T, "findFirstOrThrow", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Find zero or more RecordTrashes that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RecordTrashFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all RecordTrashes
     * const recordTrashes = await prisma.recordTrash.findMany()
     * 
     * // Get first 10 RecordTrashes
     * const recordTrashes = await prisma.recordTrash.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const recordTrashWithIdOnly = await prisma.recordTrash.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends RecordTrashFindManyArgs>(args?: SelectSubset<T, RecordTrashFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$RecordTrashPayload<ExtArgs>, T, "findMany", ClientOptions>>

    /**
     * Create a RecordTrash.
     * @param {RecordTrashCreateArgs} args - Arguments to create a RecordTrash.
     * @example
     * // Create one RecordTrash
     * const RecordTrash = await prisma.recordTrash.create({
     *   data: {
     *     // ... data to create a RecordTrash
     *   }
     * })
     * 
     */
    create<T extends RecordTrashCreateArgs>(args: SelectSubset<T, RecordTrashCreateArgs<ExtArgs>>): Prisma__RecordTrashClient<$Result.GetResult<Prisma.$RecordTrashPayload<ExtArgs>, T, "create", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Create many RecordTrashes.
     * @param {RecordTrashCreateManyArgs} args - Arguments to create many RecordTrashes.
     * @example
     * // Create many RecordTrashes
     * const recordTrash = await prisma.recordTrash.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends RecordTrashCreateManyArgs>(args?: SelectSubset<T, RecordTrashCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many RecordTrashes and returns the data saved in the database.
     * @param {RecordTrashCreateManyAndReturnArgs} args - Arguments to create many RecordTrashes.
     * @example
     * // Create many RecordTrashes
     * const recordTrash = await prisma.recordTrash.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many RecordTrashes and only return the `id`
     * const recordTrashWithIdOnly = await prisma.recordTrash.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends RecordTrashCreateManyAndReturnArgs>(args?: SelectSubset<T, RecordTrashCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$RecordTrashPayload<ExtArgs>, T, "createManyAndReturn", ClientOptions>>

    /**
     * Delete a RecordTrash.
     * @param {RecordTrashDeleteArgs} args - Arguments to delete one RecordTrash.
     * @example
     * // Delete one RecordTrash
     * const RecordTrash = await prisma.recordTrash.delete({
     *   where: {
     *     // ... filter to delete one RecordTrash
     *   }
     * })
     * 
     */
    delete<T extends RecordTrashDeleteArgs>(args: SelectSubset<T, RecordTrashDeleteArgs<ExtArgs>>): Prisma__RecordTrashClient<$Result.GetResult<Prisma.$RecordTrashPayload<ExtArgs>, T, "delete", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Update one RecordTrash.
     * @param {RecordTrashUpdateArgs} args - Arguments to update one RecordTrash.
     * @example
     * // Update one RecordTrash
     * const recordTrash = await prisma.recordTrash.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends RecordTrashUpdateArgs>(args: SelectSubset<T, RecordTrashUpdateArgs<ExtArgs>>): Prisma__RecordTrashClient<$Result.GetResult<Prisma.$RecordTrashPayload<ExtArgs>, T, "update", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Delete zero or more RecordTrashes.
     * @param {RecordTrashDeleteManyArgs} args - Arguments to filter RecordTrashes to delete.
     * @example
     * // Delete a few RecordTrashes
     * const { count } = await prisma.recordTrash.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends RecordTrashDeleteManyArgs>(args?: SelectSubset<T, RecordTrashDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more RecordTrashes.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RecordTrashUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many RecordTrashes
     * const recordTrash = await prisma.recordTrash.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends RecordTrashUpdateManyArgs>(args: SelectSubset<T, RecordTrashUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more RecordTrashes and returns the data updated in the database.
     * @param {RecordTrashUpdateManyAndReturnArgs} args - Arguments to update many RecordTrashes.
     * @example
     * // Update many RecordTrashes
     * const recordTrash = await prisma.recordTrash.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more RecordTrashes and only return the `id`
     * const recordTrashWithIdOnly = await prisma.recordTrash.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends RecordTrashUpdateManyAndReturnArgs>(args: SelectSubset<T, RecordTrashUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$RecordTrashPayload<ExtArgs>, T, "updateManyAndReturn", ClientOptions>>

    /**
     * Create or update one RecordTrash.
     * @param {RecordTrashUpsertArgs} args - Arguments to update or create a RecordTrash.
     * @example
     * // Update or create a RecordTrash
     * const recordTrash = await prisma.recordTrash.upsert({
     *   create: {
     *     // ... data to create a RecordTrash
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the RecordTrash we want to update
     *   }
     * })
     */
    upsert<T extends RecordTrashUpsertArgs>(args: SelectSubset<T, RecordTrashUpsertArgs<ExtArgs>>): Prisma__RecordTrashClient<$Result.GetResult<Prisma.$RecordTrashPayload<ExtArgs>, T, "upsert", ClientOptions>, never, ExtArgs, ClientOptions>


    /**
     * Count the number of RecordTrashes.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RecordTrashCountArgs} args - Arguments to filter RecordTrashes to count.
     * @example
     * // Count the number of RecordTrashes
     * const count = await prisma.recordTrash.count({
     *   where: {
     *     // ... the filter for the RecordTrashes we want to count
     *   }
     * })
    **/
    count<T extends RecordTrashCountArgs>(
      args?: Subset<T, RecordTrashCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], RecordTrashCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a RecordTrash.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RecordTrashAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends RecordTrashAggregateArgs>(args: Subset<T, RecordTrashAggregateArgs>): Prisma.PrismaPromise<GetRecordTrashAggregateType<T>>

    /**
     * Group by RecordTrash.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RecordTrashGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends RecordTrashGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: RecordTrashGroupByArgs['orderBy'] }
        : { orderBy?: RecordTrashGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, RecordTrashGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetRecordTrashGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the RecordTrash model
   */
  readonly fields: RecordTrashFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for RecordTrash.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__RecordTrashClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the RecordTrash model
   */ 
  interface RecordTrashFieldRefs {
    readonly id: FieldRef<"RecordTrash", 'String'>
    readonly tableId: FieldRef<"RecordTrash", 'String'>
    readonly recordId: FieldRef<"RecordTrash", 'String'>
    readonly snapshot: FieldRef<"RecordTrash", 'String'>
    readonly createdTime: FieldRef<"RecordTrash", 'DateTime'>
    readonly createdBy: FieldRef<"RecordTrash", 'String'>
  }
    

  // Custom InputTypes
  /**
   * RecordTrash findUnique
   */
  export type RecordTrashFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RecordTrash
     */
    select?: RecordTrashSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RecordTrash
     */
    omit?: RecordTrashOmit<ExtArgs> | null
    /**
     * Filter, which RecordTrash to fetch.
     */
    where: RecordTrashWhereUniqueInput
  }

  /**
   * RecordTrash findUniqueOrThrow
   */
  export type RecordTrashFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RecordTrash
     */
    select?: RecordTrashSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RecordTrash
     */
    omit?: RecordTrashOmit<ExtArgs> | null
    /**
     * Filter, which RecordTrash to fetch.
     */
    where: RecordTrashWhereUniqueInput
  }

  /**
   * RecordTrash findFirst
   */
  export type RecordTrashFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RecordTrash
     */
    select?: RecordTrashSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RecordTrash
     */
    omit?: RecordTrashOmit<ExtArgs> | null
    /**
     * Filter, which RecordTrash to fetch.
     */
    where?: RecordTrashWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of RecordTrashes to fetch.
     */
    orderBy?: RecordTrashOrderByWithRelationInput | RecordTrashOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for RecordTrashes.
     */
    cursor?: RecordTrashWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` RecordTrashes from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` RecordTrashes.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of RecordTrashes.
     */
    distinct?: RecordTrashScalarFieldEnum | RecordTrashScalarFieldEnum[]
  }

  /**
   * RecordTrash findFirstOrThrow
   */
  export type RecordTrashFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RecordTrash
     */
    select?: RecordTrashSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RecordTrash
     */
    omit?: RecordTrashOmit<ExtArgs> | null
    /**
     * Filter, which RecordTrash to fetch.
     */
    where?: RecordTrashWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of RecordTrashes to fetch.
     */
    orderBy?: RecordTrashOrderByWithRelationInput | RecordTrashOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for RecordTrashes.
     */
    cursor?: RecordTrashWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` RecordTrashes from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` RecordTrashes.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of RecordTrashes.
     */
    distinct?: RecordTrashScalarFieldEnum | RecordTrashScalarFieldEnum[]
  }

  /**
   * RecordTrash findMany
   */
  export type RecordTrashFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RecordTrash
     */
    select?: RecordTrashSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RecordTrash
     */
    omit?: RecordTrashOmit<ExtArgs> | null
    /**
     * Filter, which RecordTrashes to fetch.
     */
    where?: RecordTrashWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of RecordTrashes to fetch.
     */
    orderBy?: RecordTrashOrderByWithRelationInput | RecordTrashOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing RecordTrashes.
     */
    cursor?: RecordTrashWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` RecordTrashes from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` RecordTrashes.
     */
    skip?: number
    distinct?: RecordTrashScalarFieldEnum | RecordTrashScalarFieldEnum[]
  }

  /**
   * RecordTrash create
   */
  export type RecordTrashCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RecordTrash
     */
    select?: RecordTrashSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RecordTrash
     */
    omit?: RecordTrashOmit<ExtArgs> | null
    /**
     * The data needed to create a RecordTrash.
     */
    data: XOR<RecordTrashCreateInput, RecordTrashUncheckedCreateInput>
  }

  /**
   * RecordTrash createMany
   */
  export type RecordTrashCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many RecordTrashes.
     */
    data: RecordTrashCreateManyInput | RecordTrashCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * RecordTrash createManyAndReturn
   */
  export type RecordTrashCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RecordTrash
     */
    select?: RecordTrashSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the RecordTrash
     */
    omit?: RecordTrashOmit<ExtArgs> | null
    /**
     * The data used to create many RecordTrashes.
     */
    data: RecordTrashCreateManyInput | RecordTrashCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * RecordTrash update
   */
  export type RecordTrashUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RecordTrash
     */
    select?: RecordTrashSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RecordTrash
     */
    omit?: RecordTrashOmit<ExtArgs> | null
    /**
     * The data needed to update a RecordTrash.
     */
    data: XOR<RecordTrashUpdateInput, RecordTrashUncheckedUpdateInput>
    /**
     * Choose, which RecordTrash to update.
     */
    where: RecordTrashWhereUniqueInput
  }

  /**
   * RecordTrash updateMany
   */
  export type RecordTrashUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update RecordTrashes.
     */
    data: XOR<RecordTrashUpdateManyMutationInput, RecordTrashUncheckedUpdateManyInput>
    /**
     * Filter which RecordTrashes to update
     */
    where?: RecordTrashWhereInput
  }

  /**
   * RecordTrash updateManyAndReturn
   */
  export type RecordTrashUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RecordTrash
     */
    select?: RecordTrashSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the RecordTrash
     */
    omit?: RecordTrashOmit<ExtArgs> | null
    /**
     * The data used to update RecordTrashes.
     */
    data: XOR<RecordTrashUpdateManyMutationInput, RecordTrashUncheckedUpdateManyInput>
    /**
     * Filter which RecordTrashes to update
     */
    where?: RecordTrashWhereInput
  }

  /**
   * RecordTrash upsert
   */
  export type RecordTrashUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RecordTrash
     */
    select?: RecordTrashSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RecordTrash
     */
    omit?: RecordTrashOmit<ExtArgs> | null
    /**
     * The filter to search for the RecordTrash to update in case it exists.
     */
    where: RecordTrashWhereUniqueInput
    /**
     * In case the RecordTrash found by the `where` argument doesn't exist, create a new RecordTrash with this data.
     */
    create: XOR<RecordTrashCreateInput, RecordTrashUncheckedCreateInput>
    /**
     * In case the RecordTrash was found with the provided `where` argument, update it with this data.
     */
    update: XOR<RecordTrashUpdateInput, RecordTrashUncheckedUpdateInput>
  }

  /**
   * RecordTrash delete
   */
  export type RecordTrashDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RecordTrash
     */
    select?: RecordTrashSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RecordTrash
     */
    omit?: RecordTrashOmit<ExtArgs> | null
    /**
     * Filter which RecordTrash to delete.
     */
    where: RecordTrashWhereUniqueInput
  }

  /**
   * RecordTrash deleteMany
   */
  export type RecordTrashDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which RecordTrashes to delete
     */
    where?: RecordTrashWhereInput
  }

  /**
   * RecordTrash without action
   */
  export type RecordTrashDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RecordTrash
     */
    select?: RecordTrashSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RecordTrash
     */
    omit?: RecordTrashOmit<ExtArgs> | null
  }


  /**
   * Model Attachments
   */

  export type AggregateAttachments = {
    _count: AttachmentsCountAggregateOutputType | null
    _avg: AttachmentsAvgAggregateOutputType | null
    _sum: AttachmentsSumAggregateOutputType | null
    _min: AttachmentsMinAggregateOutputType | null
    _max: AttachmentsMaxAggregateOutputType | null
  }

  export type AttachmentsAvgAggregateOutputType = {
    size: number | null
    width: number | null
    height: number | null
  }

  export type AttachmentsSumAggregateOutputType = {
    size: bigint | null
    width: number | null
    height: number | null
  }

  export type AttachmentsMinAggregateOutputType = {
    id: string | null
    token: string | null
    hash: string | null
    size: bigint | null
    mimetype: string | null
    path: string | null
    width: number | null
    height: number | null
    deletedTime: Date | null
    createdTime: Date | null
    createdBy: string | null
    lastModifiedBy: string | null
    thumbnailPath: string | null
  }

  export type AttachmentsMaxAggregateOutputType = {
    id: string | null
    token: string | null
    hash: string | null
    size: bigint | null
    mimetype: string | null
    path: string | null
    width: number | null
    height: number | null
    deletedTime: Date | null
    createdTime: Date | null
    createdBy: string | null
    lastModifiedBy: string | null
    thumbnailPath: string | null
  }

  export type AttachmentsCountAggregateOutputType = {
    id: number
    token: number
    hash: number
    size: number
    mimetype: number
    path: number
    width: number
    height: number
    deletedTime: number
    createdTime: number
    createdBy: number
    lastModifiedBy: number
    thumbnailPath: number
    _all: number
  }


  export type AttachmentsAvgAggregateInputType = {
    size?: true
    width?: true
    height?: true
  }

  export type AttachmentsSumAggregateInputType = {
    size?: true
    width?: true
    height?: true
  }

  export type AttachmentsMinAggregateInputType = {
    id?: true
    token?: true
    hash?: true
    size?: true
    mimetype?: true
    path?: true
    width?: true
    height?: true
    deletedTime?: true
    createdTime?: true
    createdBy?: true
    lastModifiedBy?: true
    thumbnailPath?: true
  }

  export type AttachmentsMaxAggregateInputType = {
    id?: true
    token?: true
    hash?: true
    size?: true
    mimetype?: true
    path?: true
    width?: true
    height?: true
    deletedTime?: true
    createdTime?: true
    createdBy?: true
    lastModifiedBy?: true
    thumbnailPath?: true
  }

  export type AttachmentsCountAggregateInputType = {
    id?: true
    token?: true
    hash?: true
    size?: true
    mimetype?: true
    path?: true
    width?: true
    height?: true
    deletedTime?: true
    createdTime?: true
    createdBy?: true
    lastModifiedBy?: true
    thumbnailPath?: true
    _all?: true
  }

  export type AttachmentsAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Attachments to aggregate.
     */
    where?: AttachmentsWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Attachments to fetch.
     */
    orderBy?: AttachmentsOrderByWithRelationInput | AttachmentsOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: AttachmentsWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Attachments from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Attachments.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Attachments
    **/
    _count?: true | AttachmentsCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: AttachmentsAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: AttachmentsSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: AttachmentsMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: AttachmentsMaxAggregateInputType
  }

  export type GetAttachmentsAggregateType<T extends AttachmentsAggregateArgs> = {
        [P in keyof T & keyof AggregateAttachments]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateAttachments[P]>
      : GetScalarType<T[P], AggregateAttachments[P]>
  }




  export type AttachmentsGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: AttachmentsWhereInput
    orderBy?: AttachmentsOrderByWithAggregationInput | AttachmentsOrderByWithAggregationInput[]
    by: AttachmentsScalarFieldEnum[] | AttachmentsScalarFieldEnum
    having?: AttachmentsScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: AttachmentsCountAggregateInputType | true
    _avg?: AttachmentsAvgAggregateInputType
    _sum?: AttachmentsSumAggregateInputType
    _min?: AttachmentsMinAggregateInputType
    _max?: AttachmentsMaxAggregateInputType
  }

  export type AttachmentsGroupByOutputType = {
    id: string
    token: string
    hash: string
    size: bigint
    mimetype: string
    path: string
    width: number | null
    height: number | null
    deletedTime: Date | null
    createdTime: Date
    createdBy: string
    lastModifiedBy: string | null
    thumbnailPath: string | null
    _count: AttachmentsCountAggregateOutputType | null
    _avg: AttachmentsAvgAggregateOutputType | null
    _sum: AttachmentsSumAggregateOutputType | null
    _min: AttachmentsMinAggregateOutputType | null
    _max: AttachmentsMaxAggregateOutputType | null
  }

  type GetAttachmentsGroupByPayload<T extends AttachmentsGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<AttachmentsGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof AttachmentsGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], AttachmentsGroupByOutputType[P]>
            : GetScalarType<T[P], AttachmentsGroupByOutputType[P]>
        }
      >
    >


  export type AttachmentsSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    token?: boolean
    hash?: boolean
    size?: boolean
    mimetype?: boolean
    path?: boolean
    width?: boolean
    height?: boolean
    deletedTime?: boolean
    createdTime?: boolean
    createdBy?: boolean
    lastModifiedBy?: boolean
    thumbnailPath?: boolean
  }, ExtArgs["result"]["attachments"]>

  export type AttachmentsSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    token?: boolean
    hash?: boolean
    size?: boolean
    mimetype?: boolean
    path?: boolean
    width?: boolean
    height?: boolean
    deletedTime?: boolean
    createdTime?: boolean
    createdBy?: boolean
    lastModifiedBy?: boolean
    thumbnailPath?: boolean
  }, ExtArgs["result"]["attachments"]>

  export type AttachmentsSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    token?: boolean
    hash?: boolean
    size?: boolean
    mimetype?: boolean
    path?: boolean
    width?: boolean
    height?: boolean
    deletedTime?: boolean
    createdTime?: boolean
    createdBy?: boolean
    lastModifiedBy?: boolean
    thumbnailPath?: boolean
  }, ExtArgs["result"]["attachments"]>

  export type AttachmentsSelectScalar = {
    id?: boolean
    token?: boolean
    hash?: boolean
    size?: boolean
    mimetype?: boolean
    path?: boolean
    width?: boolean
    height?: boolean
    deletedTime?: boolean
    createdTime?: boolean
    createdBy?: boolean
    lastModifiedBy?: boolean
    thumbnailPath?: boolean
  }

  export type AttachmentsOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "token" | "hash" | "size" | "mimetype" | "path" | "width" | "height" | "deletedTime" | "createdTime" | "createdBy" | "lastModifiedBy" | "thumbnailPath", ExtArgs["result"]["attachments"]>

  export type $AttachmentsPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Attachments"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      token: string
      hash: string
      size: bigint
      mimetype: string
      path: string
      width: number | null
      height: number | null
      deletedTime: Date | null
      createdTime: Date
      createdBy: string
      lastModifiedBy: string | null
      thumbnailPath: string | null
    }, ExtArgs["result"]["attachments"]>
    composites: {}
  }

  type AttachmentsGetPayload<S extends boolean | null | undefined | AttachmentsDefaultArgs> = $Result.GetResult<Prisma.$AttachmentsPayload, S>

  type AttachmentsCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<AttachmentsFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: AttachmentsCountAggregateInputType | true
    }

  export interface AttachmentsDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Attachments'], meta: { name: 'Attachments' } }
    /**
     * Find zero or one Attachments that matches the filter.
     * @param {AttachmentsFindUniqueArgs} args - Arguments to find a Attachments
     * @example
     * // Get one Attachments
     * const attachments = await prisma.attachments.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends AttachmentsFindUniqueArgs>(args: SelectSubset<T, AttachmentsFindUniqueArgs<ExtArgs>>): Prisma__AttachmentsClient<$Result.GetResult<Prisma.$AttachmentsPayload<ExtArgs>, T, "findUnique", ClientOptions> | null, null, ExtArgs, ClientOptions>

    /**
     * Find one Attachments that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {AttachmentsFindUniqueOrThrowArgs} args - Arguments to find a Attachments
     * @example
     * // Get one Attachments
     * const attachments = await prisma.attachments.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends AttachmentsFindUniqueOrThrowArgs>(args: SelectSubset<T, AttachmentsFindUniqueOrThrowArgs<ExtArgs>>): Prisma__AttachmentsClient<$Result.GetResult<Prisma.$AttachmentsPayload<ExtArgs>, T, "findUniqueOrThrow", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Find the first Attachments that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AttachmentsFindFirstArgs} args - Arguments to find a Attachments
     * @example
     * // Get one Attachments
     * const attachments = await prisma.attachments.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends AttachmentsFindFirstArgs>(args?: SelectSubset<T, AttachmentsFindFirstArgs<ExtArgs>>): Prisma__AttachmentsClient<$Result.GetResult<Prisma.$AttachmentsPayload<ExtArgs>, T, "findFirst", ClientOptions> | null, null, ExtArgs, ClientOptions>

    /**
     * Find the first Attachments that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AttachmentsFindFirstOrThrowArgs} args - Arguments to find a Attachments
     * @example
     * // Get one Attachments
     * const attachments = await prisma.attachments.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends AttachmentsFindFirstOrThrowArgs>(args?: SelectSubset<T, AttachmentsFindFirstOrThrowArgs<ExtArgs>>): Prisma__AttachmentsClient<$Result.GetResult<Prisma.$AttachmentsPayload<ExtArgs>, T, "findFirstOrThrow", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Find zero or more Attachments that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AttachmentsFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Attachments
     * const attachments = await prisma.attachments.findMany()
     * 
     * // Get first 10 Attachments
     * const attachments = await prisma.attachments.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const attachmentsWithIdOnly = await prisma.attachments.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends AttachmentsFindManyArgs>(args?: SelectSubset<T, AttachmentsFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AttachmentsPayload<ExtArgs>, T, "findMany", ClientOptions>>

    /**
     * Create a Attachments.
     * @param {AttachmentsCreateArgs} args - Arguments to create a Attachments.
     * @example
     * // Create one Attachments
     * const Attachments = await prisma.attachments.create({
     *   data: {
     *     // ... data to create a Attachments
     *   }
     * })
     * 
     */
    create<T extends AttachmentsCreateArgs>(args: SelectSubset<T, AttachmentsCreateArgs<ExtArgs>>): Prisma__AttachmentsClient<$Result.GetResult<Prisma.$AttachmentsPayload<ExtArgs>, T, "create", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Create many Attachments.
     * @param {AttachmentsCreateManyArgs} args - Arguments to create many Attachments.
     * @example
     * // Create many Attachments
     * const attachments = await prisma.attachments.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends AttachmentsCreateManyArgs>(args?: SelectSubset<T, AttachmentsCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Attachments and returns the data saved in the database.
     * @param {AttachmentsCreateManyAndReturnArgs} args - Arguments to create many Attachments.
     * @example
     * // Create many Attachments
     * const attachments = await prisma.attachments.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Attachments and only return the `id`
     * const attachmentsWithIdOnly = await prisma.attachments.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends AttachmentsCreateManyAndReturnArgs>(args?: SelectSubset<T, AttachmentsCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AttachmentsPayload<ExtArgs>, T, "createManyAndReturn", ClientOptions>>

    /**
     * Delete a Attachments.
     * @param {AttachmentsDeleteArgs} args - Arguments to delete one Attachments.
     * @example
     * // Delete one Attachments
     * const Attachments = await prisma.attachments.delete({
     *   where: {
     *     // ... filter to delete one Attachments
     *   }
     * })
     * 
     */
    delete<T extends AttachmentsDeleteArgs>(args: SelectSubset<T, AttachmentsDeleteArgs<ExtArgs>>): Prisma__AttachmentsClient<$Result.GetResult<Prisma.$AttachmentsPayload<ExtArgs>, T, "delete", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Update one Attachments.
     * @param {AttachmentsUpdateArgs} args - Arguments to update one Attachments.
     * @example
     * // Update one Attachments
     * const attachments = await prisma.attachments.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends AttachmentsUpdateArgs>(args: SelectSubset<T, AttachmentsUpdateArgs<ExtArgs>>): Prisma__AttachmentsClient<$Result.GetResult<Prisma.$AttachmentsPayload<ExtArgs>, T, "update", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Delete zero or more Attachments.
     * @param {AttachmentsDeleteManyArgs} args - Arguments to filter Attachments to delete.
     * @example
     * // Delete a few Attachments
     * const { count } = await prisma.attachments.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends AttachmentsDeleteManyArgs>(args?: SelectSubset<T, AttachmentsDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Attachments.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AttachmentsUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Attachments
     * const attachments = await prisma.attachments.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends AttachmentsUpdateManyArgs>(args: SelectSubset<T, AttachmentsUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Attachments and returns the data updated in the database.
     * @param {AttachmentsUpdateManyAndReturnArgs} args - Arguments to update many Attachments.
     * @example
     * // Update many Attachments
     * const attachments = await prisma.attachments.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Attachments and only return the `id`
     * const attachmentsWithIdOnly = await prisma.attachments.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends AttachmentsUpdateManyAndReturnArgs>(args: SelectSubset<T, AttachmentsUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AttachmentsPayload<ExtArgs>, T, "updateManyAndReturn", ClientOptions>>

    /**
     * Create or update one Attachments.
     * @param {AttachmentsUpsertArgs} args - Arguments to update or create a Attachments.
     * @example
     * // Update or create a Attachments
     * const attachments = await prisma.attachments.upsert({
     *   create: {
     *     // ... data to create a Attachments
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Attachments we want to update
     *   }
     * })
     */
    upsert<T extends AttachmentsUpsertArgs>(args: SelectSubset<T, AttachmentsUpsertArgs<ExtArgs>>): Prisma__AttachmentsClient<$Result.GetResult<Prisma.$AttachmentsPayload<ExtArgs>, T, "upsert", ClientOptions>, never, ExtArgs, ClientOptions>


    /**
     * Count the number of Attachments.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AttachmentsCountArgs} args - Arguments to filter Attachments to count.
     * @example
     * // Count the number of Attachments
     * const count = await prisma.attachments.count({
     *   where: {
     *     // ... the filter for the Attachments we want to count
     *   }
     * })
    **/
    count<T extends AttachmentsCountArgs>(
      args?: Subset<T, AttachmentsCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], AttachmentsCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Attachments.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AttachmentsAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends AttachmentsAggregateArgs>(args: Subset<T, AttachmentsAggregateArgs>): Prisma.PrismaPromise<GetAttachmentsAggregateType<T>>

    /**
     * Group by Attachments.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AttachmentsGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends AttachmentsGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: AttachmentsGroupByArgs['orderBy'] }
        : { orderBy?: AttachmentsGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, AttachmentsGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetAttachmentsGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Attachments model
   */
  readonly fields: AttachmentsFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Attachments.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__AttachmentsClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Attachments model
   */ 
  interface AttachmentsFieldRefs {
    readonly id: FieldRef<"Attachments", 'String'>
    readonly token: FieldRef<"Attachments", 'String'>
    readonly hash: FieldRef<"Attachments", 'String'>
    readonly size: FieldRef<"Attachments", 'BigInt'>
    readonly mimetype: FieldRef<"Attachments", 'String'>
    readonly path: FieldRef<"Attachments", 'String'>
    readonly width: FieldRef<"Attachments", 'Int'>
    readonly height: FieldRef<"Attachments", 'Int'>
    readonly deletedTime: FieldRef<"Attachments", 'DateTime'>
    readonly createdTime: FieldRef<"Attachments", 'DateTime'>
    readonly createdBy: FieldRef<"Attachments", 'String'>
    readonly lastModifiedBy: FieldRef<"Attachments", 'String'>
    readonly thumbnailPath: FieldRef<"Attachments", 'String'>
  }
    

  // Custom InputTypes
  /**
   * Attachments findUnique
   */
  export type AttachmentsFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Attachments
     */
    select?: AttachmentsSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Attachments
     */
    omit?: AttachmentsOmit<ExtArgs> | null
    /**
     * Filter, which Attachments to fetch.
     */
    where: AttachmentsWhereUniqueInput
  }

  /**
   * Attachments findUniqueOrThrow
   */
  export type AttachmentsFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Attachments
     */
    select?: AttachmentsSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Attachments
     */
    omit?: AttachmentsOmit<ExtArgs> | null
    /**
     * Filter, which Attachments to fetch.
     */
    where: AttachmentsWhereUniqueInput
  }

  /**
   * Attachments findFirst
   */
  export type AttachmentsFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Attachments
     */
    select?: AttachmentsSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Attachments
     */
    omit?: AttachmentsOmit<ExtArgs> | null
    /**
     * Filter, which Attachments to fetch.
     */
    where?: AttachmentsWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Attachments to fetch.
     */
    orderBy?: AttachmentsOrderByWithRelationInput | AttachmentsOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Attachments.
     */
    cursor?: AttachmentsWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Attachments from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Attachments.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Attachments.
     */
    distinct?: AttachmentsScalarFieldEnum | AttachmentsScalarFieldEnum[]
  }

  /**
   * Attachments findFirstOrThrow
   */
  export type AttachmentsFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Attachments
     */
    select?: AttachmentsSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Attachments
     */
    omit?: AttachmentsOmit<ExtArgs> | null
    /**
     * Filter, which Attachments to fetch.
     */
    where?: AttachmentsWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Attachments to fetch.
     */
    orderBy?: AttachmentsOrderByWithRelationInput | AttachmentsOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Attachments.
     */
    cursor?: AttachmentsWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Attachments from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Attachments.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Attachments.
     */
    distinct?: AttachmentsScalarFieldEnum | AttachmentsScalarFieldEnum[]
  }

  /**
   * Attachments findMany
   */
  export type AttachmentsFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Attachments
     */
    select?: AttachmentsSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Attachments
     */
    omit?: AttachmentsOmit<ExtArgs> | null
    /**
     * Filter, which Attachments to fetch.
     */
    where?: AttachmentsWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Attachments to fetch.
     */
    orderBy?: AttachmentsOrderByWithRelationInput | AttachmentsOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Attachments.
     */
    cursor?: AttachmentsWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Attachments from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Attachments.
     */
    skip?: number
    distinct?: AttachmentsScalarFieldEnum | AttachmentsScalarFieldEnum[]
  }

  /**
   * Attachments create
   */
  export type AttachmentsCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Attachments
     */
    select?: AttachmentsSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Attachments
     */
    omit?: AttachmentsOmit<ExtArgs> | null
    /**
     * The data needed to create a Attachments.
     */
    data: XOR<AttachmentsCreateInput, AttachmentsUncheckedCreateInput>
  }

  /**
   * Attachments createMany
   */
  export type AttachmentsCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Attachments.
     */
    data: AttachmentsCreateManyInput | AttachmentsCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Attachments createManyAndReturn
   */
  export type AttachmentsCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Attachments
     */
    select?: AttachmentsSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Attachments
     */
    omit?: AttachmentsOmit<ExtArgs> | null
    /**
     * The data used to create many Attachments.
     */
    data: AttachmentsCreateManyInput | AttachmentsCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Attachments update
   */
  export type AttachmentsUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Attachments
     */
    select?: AttachmentsSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Attachments
     */
    omit?: AttachmentsOmit<ExtArgs> | null
    /**
     * The data needed to update a Attachments.
     */
    data: XOR<AttachmentsUpdateInput, AttachmentsUncheckedUpdateInput>
    /**
     * Choose, which Attachments to update.
     */
    where: AttachmentsWhereUniqueInput
  }

  /**
   * Attachments updateMany
   */
  export type AttachmentsUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Attachments.
     */
    data: XOR<AttachmentsUpdateManyMutationInput, AttachmentsUncheckedUpdateManyInput>
    /**
     * Filter which Attachments to update
     */
    where?: AttachmentsWhereInput
  }

  /**
   * Attachments updateManyAndReturn
   */
  export type AttachmentsUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Attachments
     */
    select?: AttachmentsSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Attachments
     */
    omit?: AttachmentsOmit<ExtArgs> | null
    /**
     * The data used to update Attachments.
     */
    data: XOR<AttachmentsUpdateManyMutationInput, AttachmentsUncheckedUpdateManyInput>
    /**
     * Filter which Attachments to update
     */
    where?: AttachmentsWhereInput
  }

  /**
   * Attachments upsert
   */
  export type AttachmentsUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Attachments
     */
    select?: AttachmentsSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Attachments
     */
    omit?: AttachmentsOmit<ExtArgs> | null
    /**
     * The filter to search for the Attachments to update in case it exists.
     */
    where: AttachmentsWhereUniqueInput
    /**
     * In case the Attachments found by the `where` argument doesn't exist, create a new Attachments with this data.
     */
    create: XOR<AttachmentsCreateInput, AttachmentsUncheckedCreateInput>
    /**
     * In case the Attachments was found with the provided `where` argument, update it with this data.
     */
    update: XOR<AttachmentsUpdateInput, AttachmentsUncheckedUpdateInput>
  }

  /**
   * Attachments delete
   */
  export type AttachmentsDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Attachments
     */
    select?: AttachmentsSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Attachments
     */
    omit?: AttachmentsOmit<ExtArgs> | null
    /**
     * Filter which Attachments to delete.
     */
    where: AttachmentsWhereUniqueInput
  }

  /**
   * Attachments deleteMany
   */
  export type AttachmentsDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Attachments to delete
     */
    where?: AttachmentsWhereInput
  }

  /**
   * Attachments without action
   */
  export type AttachmentsDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Attachments
     */
    select?: AttachmentsSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Attachments
     */
    omit?: AttachmentsOmit<ExtArgs> | null
  }


  /**
   * Model AttachmentsTable
   */

  export type AggregateAttachmentsTable = {
    _count: AttachmentsTableCountAggregateOutputType | null
    _min: AttachmentsTableMinAggregateOutputType | null
    _max: AttachmentsTableMaxAggregateOutputType | null
  }

  export type AttachmentsTableMinAggregateOutputType = {
    id: string | null
    attachmentId: string | null
    name: string | null
    token: string | null
    tableId: string | null
    recordId: string | null
    fieldId: string | null
    createdTime: Date | null
    createdBy: string | null
    lastModifiedBy: string | null
    lastModifiedTime: Date | null
  }

  export type AttachmentsTableMaxAggregateOutputType = {
    id: string | null
    attachmentId: string | null
    name: string | null
    token: string | null
    tableId: string | null
    recordId: string | null
    fieldId: string | null
    createdTime: Date | null
    createdBy: string | null
    lastModifiedBy: string | null
    lastModifiedTime: Date | null
  }

  export type AttachmentsTableCountAggregateOutputType = {
    id: number
    attachmentId: number
    name: number
    token: number
    tableId: number
    recordId: number
    fieldId: number
    createdTime: number
    createdBy: number
    lastModifiedBy: number
    lastModifiedTime: number
    _all: number
  }


  export type AttachmentsTableMinAggregateInputType = {
    id?: true
    attachmentId?: true
    name?: true
    token?: true
    tableId?: true
    recordId?: true
    fieldId?: true
    createdTime?: true
    createdBy?: true
    lastModifiedBy?: true
    lastModifiedTime?: true
  }

  export type AttachmentsTableMaxAggregateInputType = {
    id?: true
    attachmentId?: true
    name?: true
    token?: true
    tableId?: true
    recordId?: true
    fieldId?: true
    createdTime?: true
    createdBy?: true
    lastModifiedBy?: true
    lastModifiedTime?: true
  }

  export type AttachmentsTableCountAggregateInputType = {
    id?: true
    attachmentId?: true
    name?: true
    token?: true
    tableId?: true
    recordId?: true
    fieldId?: true
    createdTime?: true
    createdBy?: true
    lastModifiedBy?: true
    lastModifiedTime?: true
    _all?: true
  }

  export type AttachmentsTableAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which AttachmentsTable to aggregate.
     */
    where?: AttachmentsTableWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AttachmentsTables to fetch.
     */
    orderBy?: AttachmentsTableOrderByWithRelationInput | AttachmentsTableOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: AttachmentsTableWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AttachmentsTables from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AttachmentsTables.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned AttachmentsTables
    **/
    _count?: true | AttachmentsTableCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: AttachmentsTableMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: AttachmentsTableMaxAggregateInputType
  }

  export type GetAttachmentsTableAggregateType<T extends AttachmentsTableAggregateArgs> = {
        [P in keyof T & keyof AggregateAttachmentsTable]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateAttachmentsTable[P]>
      : GetScalarType<T[P], AggregateAttachmentsTable[P]>
  }




  export type AttachmentsTableGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: AttachmentsTableWhereInput
    orderBy?: AttachmentsTableOrderByWithAggregationInput | AttachmentsTableOrderByWithAggregationInput[]
    by: AttachmentsTableScalarFieldEnum[] | AttachmentsTableScalarFieldEnum
    having?: AttachmentsTableScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: AttachmentsTableCountAggregateInputType | true
    _min?: AttachmentsTableMinAggregateInputType
    _max?: AttachmentsTableMaxAggregateInputType
  }

  export type AttachmentsTableGroupByOutputType = {
    id: string
    attachmentId: string
    name: string
    token: string
    tableId: string
    recordId: string
    fieldId: string
    createdTime: Date
    createdBy: string
    lastModifiedBy: string | null
    lastModifiedTime: Date | null
    _count: AttachmentsTableCountAggregateOutputType | null
    _min: AttachmentsTableMinAggregateOutputType | null
    _max: AttachmentsTableMaxAggregateOutputType | null
  }

  type GetAttachmentsTableGroupByPayload<T extends AttachmentsTableGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<AttachmentsTableGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof AttachmentsTableGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], AttachmentsTableGroupByOutputType[P]>
            : GetScalarType<T[P], AttachmentsTableGroupByOutputType[P]>
        }
      >
    >


  export type AttachmentsTableSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    attachmentId?: boolean
    name?: boolean
    token?: boolean
    tableId?: boolean
    recordId?: boolean
    fieldId?: boolean
    createdTime?: boolean
    createdBy?: boolean
    lastModifiedBy?: boolean
    lastModifiedTime?: boolean
  }, ExtArgs["result"]["attachmentsTable"]>

  export type AttachmentsTableSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    attachmentId?: boolean
    name?: boolean
    token?: boolean
    tableId?: boolean
    recordId?: boolean
    fieldId?: boolean
    createdTime?: boolean
    createdBy?: boolean
    lastModifiedBy?: boolean
    lastModifiedTime?: boolean
  }, ExtArgs["result"]["attachmentsTable"]>

  export type AttachmentsTableSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    attachmentId?: boolean
    name?: boolean
    token?: boolean
    tableId?: boolean
    recordId?: boolean
    fieldId?: boolean
    createdTime?: boolean
    createdBy?: boolean
    lastModifiedBy?: boolean
    lastModifiedTime?: boolean
  }, ExtArgs["result"]["attachmentsTable"]>

  export type AttachmentsTableSelectScalar = {
    id?: boolean
    attachmentId?: boolean
    name?: boolean
    token?: boolean
    tableId?: boolean
    recordId?: boolean
    fieldId?: boolean
    createdTime?: boolean
    createdBy?: boolean
    lastModifiedBy?: boolean
    lastModifiedTime?: boolean
  }

  export type AttachmentsTableOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "attachmentId" | "name" | "token" | "tableId" | "recordId" | "fieldId" | "createdTime" | "createdBy" | "lastModifiedBy" | "lastModifiedTime", ExtArgs["result"]["attachmentsTable"]>

  export type $AttachmentsTablePayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "AttachmentsTable"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      attachmentId: string
      name: string
      token: string
      tableId: string
      recordId: string
      fieldId: string
      createdTime: Date
      createdBy: string
      lastModifiedBy: string | null
      lastModifiedTime: Date | null
    }, ExtArgs["result"]["attachmentsTable"]>
    composites: {}
  }

  type AttachmentsTableGetPayload<S extends boolean | null | undefined | AttachmentsTableDefaultArgs> = $Result.GetResult<Prisma.$AttachmentsTablePayload, S>

  type AttachmentsTableCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<AttachmentsTableFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: AttachmentsTableCountAggregateInputType | true
    }

  export interface AttachmentsTableDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['AttachmentsTable'], meta: { name: 'AttachmentsTable' } }
    /**
     * Find zero or one AttachmentsTable that matches the filter.
     * @param {AttachmentsTableFindUniqueArgs} args - Arguments to find a AttachmentsTable
     * @example
     * // Get one AttachmentsTable
     * const attachmentsTable = await prisma.attachmentsTable.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends AttachmentsTableFindUniqueArgs>(args: SelectSubset<T, AttachmentsTableFindUniqueArgs<ExtArgs>>): Prisma__AttachmentsTableClient<$Result.GetResult<Prisma.$AttachmentsTablePayload<ExtArgs>, T, "findUnique", ClientOptions> | null, null, ExtArgs, ClientOptions>

    /**
     * Find one AttachmentsTable that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {AttachmentsTableFindUniqueOrThrowArgs} args - Arguments to find a AttachmentsTable
     * @example
     * // Get one AttachmentsTable
     * const attachmentsTable = await prisma.attachmentsTable.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends AttachmentsTableFindUniqueOrThrowArgs>(args: SelectSubset<T, AttachmentsTableFindUniqueOrThrowArgs<ExtArgs>>): Prisma__AttachmentsTableClient<$Result.GetResult<Prisma.$AttachmentsTablePayload<ExtArgs>, T, "findUniqueOrThrow", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Find the first AttachmentsTable that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AttachmentsTableFindFirstArgs} args - Arguments to find a AttachmentsTable
     * @example
     * // Get one AttachmentsTable
     * const attachmentsTable = await prisma.attachmentsTable.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends AttachmentsTableFindFirstArgs>(args?: SelectSubset<T, AttachmentsTableFindFirstArgs<ExtArgs>>): Prisma__AttachmentsTableClient<$Result.GetResult<Prisma.$AttachmentsTablePayload<ExtArgs>, T, "findFirst", ClientOptions> | null, null, ExtArgs, ClientOptions>

    /**
     * Find the first AttachmentsTable that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AttachmentsTableFindFirstOrThrowArgs} args - Arguments to find a AttachmentsTable
     * @example
     * // Get one AttachmentsTable
     * const attachmentsTable = await prisma.attachmentsTable.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends AttachmentsTableFindFirstOrThrowArgs>(args?: SelectSubset<T, AttachmentsTableFindFirstOrThrowArgs<ExtArgs>>): Prisma__AttachmentsTableClient<$Result.GetResult<Prisma.$AttachmentsTablePayload<ExtArgs>, T, "findFirstOrThrow", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Find zero or more AttachmentsTables that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AttachmentsTableFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all AttachmentsTables
     * const attachmentsTables = await prisma.attachmentsTable.findMany()
     * 
     * // Get first 10 AttachmentsTables
     * const attachmentsTables = await prisma.attachmentsTable.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const attachmentsTableWithIdOnly = await prisma.attachmentsTable.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends AttachmentsTableFindManyArgs>(args?: SelectSubset<T, AttachmentsTableFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AttachmentsTablePayload<ExtArgs>, T, "findMany", ClientOptions>>

    /**
     * Create a AttachmentsTable.
     * @param {AttachmentsTableCreateArgs} args - Arguments to create a AttachmentsTable.
     * @example
     * // Create one AttachmentsTable
     * const AttachmentsTable = await prisma.attachmentsTable.create({
     *   data: {
     *     // ... data to create a AttachmentsTable
     *   }
     * })
     * 
     */
    create<T extends AttachmentsTableCreateArgs>(args: SelectSubset<T, AttachmentsTableCreateArgs<ExtArgs>>): Prisma__AttachmentsTableClient<$Result.GetResult<Prisma.$AttachmentsTablePayload<ExtArgs>, T, "create", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Create many AttachmentsTables.
     * @param {AttachmentsTableCreateManyArgs} args - Arguments to create many AttachmentsTables.
     * @example
     * // Create many AttachmentsTables
     * const attachmentsTable = await prisma.attachmentsTable.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends AttachmentsTableCreateManyArgs>(args?: SelectSubset<T, AttachmentsTableCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many AttachmentsTables and returns the data saved in the database.
     * @param {AttachmentsTableCreateManyAndReturnArgs} args - Arguments to create many AttachmentsTables.
     * @example
     * // Create many AttachmentsTables
     * const attachmentsTable = await prisma.attachmentsTable.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many AttachmentsTables and only return the `id`
     * const attachmentsTableWithIdOnly = await prisma.attachmentsTable.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends AttachmentsTableCreateManyAndReturnArgs>(args?: SelectSubset<T, AttachmentsTableCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AttachmentsTablePayload<ExtArgs>, T, "createManyAndReturn", ClientOptions>>

    /**
     * Delete a AttachmentsTable.
     * @param {AttachmentsTableDeleteArgs} args - Arguments to delete one AttachmentsTable.
     * @example
     * // Delete one AttachmentsTable
     * const AttachmentsTable = await prisma.attachmentsTable.delete({
     *   where: {
     *     // ... filter to delete one AttachmentsTable
     *   }
     * })
     * 
     */
    delete<T extends AttachmentsTableDeleteArgs>(args: SelectSubset<T, AttachmentsTableDeleteArgs<ExtArgs>>): Prisma__AttachmentsTableClient<$Result.GetResult<Prisma.$AttachmentsTablePayload<ExtArgs>, T, "delete", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Update one AttachmentsTable.
     * @param {AttachmentsTableUpdateArgs} args - Arguments to update one AttachmentsTable.
     * @example
     * // Update one AttachmentsTable
     * const attachmentsTable = await prisma.attachmentsTable.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends AttachmentsTableUpdateArgs>(args: SelectSubset<T, AttachmentsTableUpdateArgs<ExtArgs>>): Prisma__AttachmentsTableClient<$Result.GetResult<Prisma.$AttachmentsTablePayload<ExtArgs>, T, "update", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Delete zero or more AttachmentsTables.
     * @param {AttachmentsTableDeleteManyArgs} args - Arguments to filter AttachmentsTables to delete.
     * @example
     * // Delete a few AttachmentsTables
     * const { count } = await prisma.attachmentsTable.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends AttachmentsTableDeleteManyArgs>(args?: SelectSubset<T, AttachmentsTableDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more AttachmentsTables.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AttachmentsTableUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many AttachmentsTables
     * const attachmentsTable = await prisma.attachmentsTable.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends AttachmentsTableUpdateManyArgs>(args: SelectSubset<T, AttachmentsTableUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more AttachmentsTables and returns the data updated in the database.
     * @param {AttachmentsTableUpdateManyAndReturnArgs} args - Arguments to update many AttachmentsTables.
     * @example
     * // Update many AttachmentsTables
     * const attachmentsTable = await prisma.attachmentsTable.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more AttachmentsTables and only return the `id`
     * const attachmentsTableWithIdOnly = await prisma.attachmentsTable.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends AttachmentsTableUpdateManyAndReturnArgs>(args: SelectSubset<T, AttachmentsTableUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AttachmentsTablePayload<ExtArgs>, T, "updateManyAndReturn", ClientOptions>>

    /**
     * Create or update one AttachmentsTable.
     * @param {AttachmentsTableUpsertArgs} args - Arguments to update or create a AttachmentsTable.
     * @example
     * // Update or create a AttachmentsTable
     * const attachmentsTable = await prisma.attachmentsTable.upsert({
     *   create: {
     *     // ... data to create a AttachmentsTable
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the AttachmentsTable we want to update
     *   }
     * })
     */
    upsert<T extends AttachmentsTableUpsertArgs>(args: SelectSubset<T, AttachmentsTableUpsertArgs<ExtArgs>>): Prisma__AttachmentsTableClient<$Result.GetResult<Prisma.$AttachmentsTablePayload<ExtArgs>, T, "upsert", ClientOptions>, never, ExtArgs, ClientOptions>


    /**
     * Count the number of AttachmentsTables.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AttachmentsTableCountArgs} args - Arguments to filter AttachmentsTables to count.
     * @example
     * // Count the number of AttachmentsTables
     * const count = await prisma.attachmentsTable.count({
     *   where: {
     *     // ... the filter for the AttachmentsTables we want to count
     *   }
     * })
    **/
    count<T extends AttachmentsTableCountArgs>(
      args?: Subset<T, AttachmentsTableCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], AttachmentsTableCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a AttachmentsTable.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AttachmentsTableAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends AttachmentsTableAggregateArgs>(args: Subset<T, AttachmentsTableAggregateArgs>): Prisma.PrismaPromise<GetAttachmentsTableAggregateType<T>>

    /**
     * Group by AttachmentsTable.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AttachmentsTableGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends AttachmentsTableGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: AttachmentsTableGroupByArgs['orderBy'] }
        : { orderBy?: AttachmentsTableGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, AttachmentsTableGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetAttachmentsTableGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the AttachmentsTable model
   */
  readonly fields: AttachmentsTableFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for AttachmentsTable.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__AttachmentsTableClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the AttachmentsTable model
   */ 
  interface AttachmentsTableFieldRefs {
    readonly id: FieldRef<"AttachmentsTable", 'String'>
    readonly attachmentId: FieldRef<"AttachmentsTable", 'String'>
    readonly name: FieldRef<"AttachmentsTable", 'String'>
    readonly token: FieldRef<"AttachmentsTable", 'String'>
    readonly tableId: FieldRef<"AttachmentsTable", 'String'>
    readonly recordId: FieldRef<"AttachmentsTable", 'String'>
    readonly fieldId: FieldRef<"AttachmentsTable", 'String'>
    readonly createdTime: FieldRef<"AttachmentsTable", 'DateTime'>
    readonly createdBy: FieldRef<"AttachmentsTable", 'String'>
    readonly lastModifiedBy: FieldRef<"AttachmentsTable", 'String'>
    readonly lastModifiedTime: FieldRef<"AttachmentsTable", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * AttachmentsTable findUnique
   */
  export type AttachmentsTableFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AttachmentsTable
     */
    select?: AttachmentsTableSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AttachmentsTable
     */
    omit?: AttachmentsTableOmit<ExtArgs> | null
    /**
     * Filter, which AttachmentsTable to fetch.
     */
    where: AttachmentsTableWhereUniqueInput
  }

  /**
   * AttachmentsTable findUniqueOrThrow
   */
  export type AttachmentsTableFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AttachmentsTable
     */
    select?: AttachmentsTableSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AttachmentsTable
     */
    omit?: AttachmentsTableOmit<ExtArgs> | null
    /**
     * Filter, which AttachmentsTable to fetch.
     */
    where: AttachmentsTableWhereUniqueInput
  }

  /**
   * AttachmentsTable findFirst
   */
  export type AttachmentsTableFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AttachmentsTable
     */
    select?: AttachmentsTableSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AttachmentsTable
     */
    omit?: AttachmentsTableOmit<ExtArgs> | null
    /**
     * Filter, which AttachmentsTable to fetch.
     */
    where?: AttachmentsTableWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AttachmentsTables to fetch.
     */
    orderBy?: AttachmentsTableOrderByWithRelationInput | AttachmentsTableOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for AttachmentsTables.
     */
    cursor?: AttachmentsTableWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AttachmentsTables from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AttachmentsTables.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of AttachmentsTables.
     */
    distinct?: AttachmentsTableScalarFieldEnum | AttachmentsTableScalarFieldEnum[]
  }

  /**
   * AttachmentsTable findFirstOrThrow
   */
  export type AttachmentsTableFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AttachmentsTable
     */
    select?: AttachmentsTableSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AttachmentsTable
     */
    omit?: AttachmentsTableOmit<ExtArgs> | null
    /**
     * Filter, which AttachmentsTable to fetch.
     */
    where?: AttachmentsTableWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AttachmentsTables to fetch.
     */
    orderBy?: AttachmentsTableOrderByWithRelationInput | AttachmentsTableOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for AttachmentsTables.
     */
    cursor?: AttachmentsTableWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AttachmentsTables from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AttachmentsTables.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of AttachmentsTables.
     */
    distinct?: AttachmentsTableScalarFieldEnum | AttachmentsTableScalarFieldEnum[]
  }

  /**
   * AttachmentsTable findMany
   */
  export type AttachmentsTableFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AttachmentsTable
     */
    select?: AttachmentsTableSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AttachmentsTable
     */
    omit?: AttachmentsTableOmit<ExtArgs> | null
    /**
     * Filter, which AttachmentsTables to fetch.
     */
    where?: AttachmentsTableWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AttachmentsTables to fetch.
     */
    orderBy?: AttachmentsTableOrderByWithRelationInput | AttachmentsTableOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing AttachmentsTables.
     */
    cursor?: AttachmentsTableWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AttachmentsTables from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AttachmentsTables.
     */
    skip?: number
    distinct?: AttachmentsTableScalarFieldEnum | AttachmentsTableScalarFieldEnum[]
  }

  /**
   * AttachmentsTable create
   */
  export type AttachmentsTableCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AttachmentsTable
     */
    select?: AttachmentsTableSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AttachmentsTable
     */
    omit?: AttachmentsTableOmit<ExtArgs> | null
    /**
     * The data needed to create a AttachmentsTable.
     */
    data: XOR<AttachmentsTableCreateInput, AttachmentsTableUncheckedCreateInput>
  }

  /**
   * AttachmentsTable createMany
   */
  export type AttachmentsTableCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many AttachmentsTables.
     */
    data: AttachmentsTableCreateManyInput | AttachmentsTableCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * AttachmentsTable createManyAndReturn
   */
  export type AttachmentsTableCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AttachmentsTable
     */
    select?: AttachmentsTableSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the AttachmentsTable
     */
    omit?: AttachmentsTableOmit<ExtArgs> | null
    /**
     * The data used to create many AttachmentsTables.
     */
    data: AttachmentsTableCreateManyInput | AttachmentsTableCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * AttachmentsTable update
   */
  export type AttachmentsTableUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AttachmentsTable
     */
    select?: AttachmentsTableSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AttachmentsTable
     */
    omit?: AttachmentsTableOmit<ExtArgs> | null
    /**
     * The data needed to update a AttachmentsTable.
     */
    data: XOR<AttachmentsTableUpdateInput, AttachmentsTableUncheckedUpdateInput>
    /**
     * Choose, which AttachmentsTable to update.
     */
    where: AttachmentsTableWhereUniqueInput
  }

  /**
   * AttachmentsTable updateMany
   */
  export type AttachmentsTableUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update AttachmentsTables.
     */
    data: XOR<AttachmentsTableUpdateManyMutationInput, AttachmentsTableUncheckedUpdateManyInput>
    /**
     * Filter which AttachmentsTables to update
     */
    where?: AttachmentsTableWhereInput
  }

  /**
   * AttachmentsTable updateManyAndReturn
   */
  export type AttachmentsTableUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AttachmentsTable
     */
    select?: AttachmentsTableSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the AttachmentsTable
     */
    omit?: AttachmentsTableOmit<ExtArgs> | null
    /**
     * The data used to update AttachmentsTables.
     */
    data: XOR<AttachmentsTableUpdateManyMutationInput, AttachmentsTableUncheckedUpdateManyInput>
    /**
     * Filter which AttachmentsTables to update
     */
    where?: AttachmentsTableWhereInput
  }

  /**
   * AttachmentsTable upsert
   */
  export type AttachmentsTableUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AttachmentsTable
     */
    select?: AttachmentsTableSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AttachmentsTable
     */
    omit?: AttachmentsTableOmit<ExtArgs> | null
    /**
     * The filter to search for the AttachmentsTable to update in case it exists.
     */
    where: AttachmentsTableWhereUniqueInput
    /**
     * In case the AttachmentsTable found by the `where` argument doesn't exist, create a new AttachmentsTable with this data.
     */
    create: XOR<AttachmentsTableCreateInput, AttachmentsTableUncheckedCreateInput>
    /**
     * In case the AttachmentsTable was found with the provided `where` argument, update it with this data.
     */
    update: XOR<AttachmentsTableUpdateInput, AttachmentsTableUncheckedUpdateInput>
  }

  /**
   * AttachmentsTable delete
   */
  export type AttachmentsTableDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AttachmentsTable
     */
    select?: AttachmentsTableSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AttachmentsTable
     */
    omit?: AttachmentsTableOmit<ExtArgs> | null
    /**
     * Filter which AttachmentsTable to delete.
     */
    where: AttachmentsTableWhereUniqueInput
  }

  /**
   * AttachmentsTable deleteMany
   */
  export type AttachmentsTableDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which AttachmentsTables to delete
     */
    where?: AttachmentsTableWhereInput
  }

  /**
   * AttachmentsTable without action
   */
  export type AttachmentsTableDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AttachmentsTable
     */
    select?: AttachmentsTableSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AttachmentsTable
     */
    omit?: AttachmentsTableOmit<ExtArgs> | null
  }


  /**
   * Enums
   */

  export const TransactionIsolationLevel: {
    ReadUncommitted: 'ReadUncommitted',
    ReadCommitted: 'ReadCommitted',
    RepeatableRead: 'RepeatableRead',
    Serializable: 'Serializable'
  };

  export type TransactionIsolationLevel = (typeof TransactionIsolationLevel)[keyof typeof TransactionIsolationLevel]


  export const ComputedUpdateOutboxScalarFieldEnum: {
    id: 'id',
    baseId: 'baseId',
    seedTableId: 'seedTableId',
    seedRecordIds: 'seedRecordIds',
    changeType: 'changeType',
    steps: 'steps',
    edges: 'edges',
    status: 'status',
    attempts: 'attempts',
    maxAttempts: 'maxAttempts',
    nextRunAt: 'nextRunAt',
    lockedAt: 'lockedAt',
    lockedBy: 'lockedBy',
    lastError: 'lastError',
    estimatedComplexity: 'estimatedComplexity',
    planHash: 'planHash',
    dirtyStats: 'dirtyStats',
    runId: 'runId',
    originRunIds: 'originRunIds',
    runTotalSteps: 'runTotalSteps',
    runCompletedStepsBefore: 'runCompletedStepsBefore',
    affectedTableIds: 'affectedTableIds',
    affectedFieldIds: 'affectedFieldIds',
    syncMaxLevel: 'syncMaxLevel',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type ComputedUpdateOutboxScalarFieldEnum = (typeof ComputedUpdateOutboxScalarFieldEnum)[keyof typeof ComputedUpdateOutboxScalarFieldEnum]


  export const ComputedUpdateOutboxSeedScalarFieldEnum: {
    id: 'id',
    taskId: 'taskId',
    tableId: 'tableId',
    recordId: 'recordId'
  };

  export type ComputedUpdateOutboxSeedScalarFieldEnum = (typeof ComputedUpdateOutboxSeedScalarFieldEnum)[keyof typeof ComputedUpdateOutboxSeedScalarFieldEnum]


  export const ComputedUpdateDeadLetterScalarFieldEnum: {
    id: 'id',
    baseId: 'baseId',
    seedTableId: 'seedTableId',
    seedRecordIds: 'seedRecordIds',
    changeType: 'changeType',
    steps: 'steps',
    edges: 'edges',
    status: 'status',
    attempts: 'attempts',
    maxAttempts: 'maxAttempts',
    nextRunAt: 'nextRunAt',
    lockedAt: 'lockedAt',
    lockedBy: 'lockedBy',
    lastError: 'lastError',
    estimatedComplexity: 'estimatedComplexity',
    planHash: 'planHash',
    dirtyStats: 'dirtyStats',
    runId: 'runId',
    originRunIds: 'originRunIds',
    runTotalSteps: 'runTotalSteps',
    runCompletedStepsBefore: 'runCompletedStepsBefore',
    affectedTableIds: 'affectedTableIds',
    affectedFieldIds: 'affectedFieldIds',
    syncMaxLevel: 'syncMaxLevel',
    traceData: 'traceData',
    failedAt: 'failedAt',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type ComputedUpdateDeadLetterScalarFieldEnum = (typeof ComputedUpdateDeadLetterScalarFieldEnum)[keyof typeof ComputedUpdateDeadLetterScalarFieldEnum]


  export const ComputedUpdatePauseScopeScalarFieldEnum: {
    id: 'id',
    scopeType: 'scopeType',
    scopeId: 'scopeId',
    pausedAt: 'pausedAt',
    pausedBy: 'pausedBy',
    resumeAt: 'resumeAt',
    reason: 'reason',
    updatedAt: 'updatedAt',
    updatedBy: 'updatedBy'
  };

  export type ComputedUpdatePauseScopeScalarFieldEnum = (typeof ComputedUpdatePauseScopeScalarFieldEnum)[keyof typeof ComputedUpdatePauseScopeScalarFieldEnum]


  export const ComputedFieldActivityScalarFieldEnum: {
    fieldId: 'fieldId',
    tableId: 'tableId',
    baseId: 'baseId',
    status: 'status',
    activeTaskCount: 'activeTaskCount',
    processingTaskCount: 'processingTaskCount',
    generation: 'generation',
    estimatedComplexity: 'estimatedComplexity',
    estimatedDirtyRecords: 'estimatedDirtyRecords',
    hasAllTargetRecords: 'hasAllTargetRecords',
    queuedAt: 'queuedAt',
    startedAt: 'startedAt',
    lastCompletedAt: 'lastCompletedAt',
    lastDurationMs: 'lastDurationMs',
    lastError: 'lastError',
    extensions: 'extensions',
    updatedAt: 'updatedAt'
  };

  export type ComputedFieldActivityScalarFieldEnum = (typeof ComputedFieldActivityScalarFieldEnum)[keyof typeof ComputedFieldActivityScalarFieldEnum]


  export const ComputedTableActivityScalarFieldEnum: {
    tableId: 'tableId',
    baseId: 'baseId',
    status: 'status',
    calculatingFieldCount: 'calculatingFieldCount',
    queuedFieldCount: 'queuedFieldCount',
    estimatedComplexity: 'estimatedComplexity',
    recentCompletions: 'recentCompletions',
    generation: 'generation',
    updatedAt: 'updatedAt'
  };

  export type ComputedTableActivityScalarFieldEnum = (typeof ComputedTableActivityScalarFieldEnum)[keyof typeof ComputedTableActivityScalarFieldEnum]


  export const ComputedTaskFieldRefScalarFieldEnum: {
    taskId: 'taskId',
    fieldId: 'fieldId',
    tableId: 'tableId',
    baseId: 'baseId',
    wasProcessing: 'wasProcessing',
    createdAt: 'createdAt'
  };

  export type ComputedTaskFieldRefScalarFieldEnum = (typeof ComputedTaskFieldRefScalarFieldEnum)[keyof typeof ComputedTaskFieldRefScalarFieldEnum]


  export const RecordHistoryScalarFieldEnum: {
    id: 'id',
    tableId: 'tableId',
    recordId: 'recordId',
    fieldId: 'fieldId',
    before: 'before',
    after: 'after',
    createdTime: 'createdTime',
    createdBy: 'createdBy'
  };

  export type RecordHistoryScalarFieldEnum = (typeof RecordHistoryScalarFieldEnum)[keyof typeof RecordHistoryScalarFieldEnum]


  export const TableTrashScalarFieldEnum: {
    id: 'id',
    tableId: 'tableId',
    resourceType: 'resourceType',
    snapshot: 'snapshot',
    createdTime: 'createdTime',
    createdBy: 'createdBy'
  };

  export type TableTrashScalarFieldEnum = (typeof TableTrashScalarFieldEnum)[keyof typeof TableTrashScalarFieldEnum]


  export const RecordTrashScalarFieldEnum: {
    id: 'id',
    tableId: 'tableId',
    recordId: 'recordId',
    snapshot: 'snapshot',
    createdTime: 'createdTime',
    createdBy: 'createdBy'
  };

  export type RecordTrashScalarFieldEnum = (typeof RecordTrashScalarFieldEnum)[keyof typeof RecordTrashScalarFieldEnum]


  export const AttachmentsScalarFieldEnum: {
    id: 'id',
    token: 'token',
    hash: 'hash',
    size: 'size',
    mimetype: 'mimetype',
    path: 'path',
    width: 'width',
    height: 'height',
    deletedTime: 'deletedTime',
    createdTime: 'createdTime',
    createdBy: 'createdBy',
    lastModifiedBy: 'lastModifiedBy',
    thumbnailPath: 'thumbnailPath'
  };

  export type AttachmentsScalarFieldEnum = (typeof AttachmentsScalarFieldEnum)[keyof typeof AttachmentsScalarFieldEnum]


  export const AttachmentsTableScalarFieldEnum: {
    id: 'id',
    attachmentId: 'attachmentId',
    name: 'name',
    token: 'token',
    tableId: 'tableId',
    recordId: 'recordId',
    fieldId: 'fieldId',
    createdTime: 'createdTime',
    createdBy: 'createdBy',
    lastModifiedBy: 'lastModifiedBy',
    lastModifiedTime: 'lastModifiedTime'
  };

  export type AttachmentsTableScalarFieldEnum = (typeof AttachmentsTableScalarFieldEnum)[keyof typeof AttachmentsTableScalarFieldEnum]


  export const SortOrder: {
    asc: 'asc',
    desc: 'desc'
  };

  export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder]


  export const NullableJsonNullValueInput: {
    DbNull: typeof DbNull,
    JsonNull: typeof JsonNull
  };

  export type NullableJsonNullValueInput = (typeof NullableJsonNullValueInput)[keyof typeof NullableJsonNullValueInput]


  export const JsonNullValueInput: {
    JsonNull: typeof JsonNull
  };

  export type JsonNullValueInput = (typeof JsonNullValueInput)[keyof typeof JsonNullValueInput]


  export const QueryMode: {
    default: 'default',
    insensitive: 'insensitive'
  };

  export type QueryMode = (typeof QueryMode)[keyof typeof QueryMode]


  export const JsonNullValueFilter: {
    DbNull: typeof DbNull,
    JsonNull: typeof JsonNull,
    AnyNull: typeof AnyNull
  };

  export type JsonNullValueFilter = (typeof JsonNullValueFilter)[keyof typeof JsonNullValueFilter]


  export const NullsOrder: {
    first: 'first',
    last: 'last'
  };

  export type NullsOrder = (typeof NullsOrder)[keyof typeof NullsOrder]


  /**
   * Field references 
   */


  /**
   * Reference to a field of type 'String'
   */
  export type StringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String'>
    


  /**
   * Reference to a field of type 'String[]'
   */
  export type ListStringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String[]'>
    


  /**
   * Reference to a field of type 'Json'
   */
  export type JsonFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Json'>
    


  /**
   * Reference to a field of type 'Int'
   */
  export type IntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int'>
    


  /**
   * Reference to a field of type 'Int[]'
   */
  export type ListIntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int[]'>
    


  /**
   * Reference to a field of type 'DateTime'
   */
  export type DateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime'>
    


  /**
   * Reference to a field of type 'DateTime[]'
   */
  export type ListDateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime[]'>
    


  /**
   * Reference to a field of type 'BigInt'
   */
  export type BigIntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'BigInt'>
    


  /**
   * Reference to a field of type 'BigInt[]'
   */
  export type ListBigIntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'BigInt[]'>
    


  /**
   * Reference to a field of type 'Boolean'
   */
  export type BooleanFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Boolean'>
    


  /**
   * Reference to a field of type 'Float'
   */
  export type FloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float'>
    


  /**
   * Reference to a field of type 'Float[]'
   */
  export type ListFloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float[]'>
    
  /**
   * Deep Input Types
   */


  export type ComputedUpdateOutboxWhereInput = {
    AND?: ComputedUpdateOutboxWhereInput | ComputedUpdateOutboxWhereInput[]
    OR?: ComputedUpdateOutboxWhereInput[]
    NOT?: ComputedUpdateOutboxWhereInput | ComputedUpdateOutboxWhereInput[]
    id?: StringFilter<"ComputedUpdateOutbox"> | string
    baseId?: StringFilter<"ComputedUpdateOutbox"> | string
    seedTableId?: StringFilter<"ComputedUpdateOutbox"> | string
    seedRecordIds?: JsonNullableFilter<"ComputedUpdateOutbox">
    changeType?: StringFilter<"ComputedUpdateOutbox"> | string
    steps?: JsonNullableFilter<"ComputedUpdateOutbox">
    edges?: JsonNullableFilter<"ComputedUpdateOutbox">
    status?: StringFilter<"ComputedUpdateOutbox"> | string
    attempts?: IntFilter<"ComputedUpdateOutbox"> | number
    maxAttempts?: IntFilter<"ComputedUpdateOutbox"> | number
    nextRunAt?: DateTimeFilter<"ComputedUpdateOutbox"> | Date | string
    lockedAt?: DateTimeNullableFilter<"ComputedUpdateOutbox"> | Date | string | null
    lockedBy?: StringNullableFilter<"ComputedUpdateOutbox"> | string | null
    lastError?: StringNullableFilter<"ComputedUpdateOutbox"> | string | null
    estimatedComplexity?: IntFilter<"ComputedUpdateOutbox"> | number
    planHash?: StringFilter<"ComputedUpdateOutbox"> | string
    dirtyStats?: JsonNullableFilter<"ComputedUpdateOutbox">
    runId?: StringFilter<"ComputedUpdateOutbox"> | string
    originRunIds?: StringNullableListFilter<"ComputedUpdateOutbox">
    runTotalSteps?: IntFilter<"ComputedUpdateOutbox"> | number
    runCompletedStepsBefore?: IntFilter<"ComputedUpdateOutbox"> | number
    affectedTableIds?: StringNullableListFilter<"ComputedUpdateOutbox">
    affectedFieldIds?: StringNullableListFilter<"ComputedUpdateOutbox">
    syncMaxLevel?: IntNullableFilter<"ComputedUpdateOutbox"> | number | null
    createdAt?: DateTimeFilter<"ComputedUpdateOutbox"> | Date | string
    updatedAt?: DateTimeFilter<"ComputedUpdateOutbox"> | Date | string
    seeds?: ComputedUpdateOutboxSeedListRelationFilter
  }

  export type ComputedUpdateOutboxOrderByWithRelationInput = {
    id?: SortOrder
    baseId?: SortOrder
    seedTableId?: SortOrder
    seedRecordIds?: SortOrderInput | SortOrder
    changeType?: SortOrder
    steps?: SortOrderInput | SortOrder
    edges?: SortOrderInput | SortOrder
    status?: SortOrder
    attempts?: SortOrder
    maxAttempts?: SortOrder
    nextRunAt?: SortOrder
    lockedAt?: SortOrderInput | SortOrder
    lockedBy?: SortOrderInput | SortOrder
    lastError?: SortOrderInput | SortOrder
    estimatedComplexity?: SortOrder
    planHash?: SortOrder
    dirtyStats?: SortOrderInput | SortOrder
    runId?: SortOrder
    originRunIds?: SortOrder
    runTotalSteps?: SortOrder
    runCompletedStepsBefore?: SortOrder
    affectedTableIds?: SortOrder
    affectedFieldIds?: SortOrder
    syncMaxLevel?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    seeds?: ComputedUpdateOutboxSeedOrderByRelationAggregateInput
  }

  export type ComputedUpdateOutboxWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: ComputedUpdateOutboxWhereInput | ComputedUpdateOutboxWhereInput[]
    OR?: ComputedUpdateOutboxWhereInput[]
    NOT?: ComputedUpdateOutboxWhereInput | ComputedUpdateOutboxWhereInput[]
    baseId?: StringFilter<"ComputedUpdateOutbox"> | string
    seedTableId?: StringFilter<"ComputedUpdateOutbox"> | string
    seedRecordIds?: JsonNullableFilter<"ComputedUpdateOutbox">
    changeType?: StringFilter<"ComputedUpdateOutbox"> | string
    steps?: JsonNullableFilter<"ComputedUpdateOutbox">
    edges?: JsonNullableFilter<"ComputedUpdateOutbox">
    status?: StringFilter<"ComputedUpdateOutbox"> | string
    attempts?: IntFilter<"ComputedUpdateOutbox"> | number
    maxAttempts?: IntFilter<"ComputedUpdateOutbox"> | number
    nextRunAt?: DateTimeFilter<"ComputedUpdateOutbox"> | Date | string
    lockedAt?: DateTimeNullableFilter<"ComputedUpdateOutbox"> | Date | string | null
    lockedBy?: StringNullableFilter<"ComputedUpdateOutbox"> | string | null
    lastError?: StringNullableFilter<"ComputedUpdateOutbox"> | string | null
    estimatedComplexity?: IntFilter<"ComputedUpdateOutbox"> | number
    planHash?: StringFilter<"ComputedUpdateOutbox"> | string
    dirtyStats?: JsonNullableFilter<"ComputedUpdateOutbox">
    runId?: StringFilter<"ComputedUpdateOutbox"> | string
    originRunIds?: StringNullableListFilter<"ComputedUpdateOutbox">
    runTotalSteps?: IntFilter<"ComputedUpdateOutbox"> | number
    runCompletedStepsBefore?: IntFilter<"ComputedUpdateOutbox"> | number
    affectedTableIds?: StringNullableListFilter<"ComputedUpdateOutbox">
    affectedFieldIds?: StringNullableListFilter<"ComputedUpdateOutbox">
    syncMaxLevel?: IntNullableFilter<"ComputedUpdateOutbox"> | number | null
    createdAt?: DateTimeFilter<"ComputedUpdateOutbox"> | Date | string
    updatedAt?: DateTimeFilter<"ComputedUpdateOutbox"> | Date | string
    seeds?: ComputedUpdateOutboxSeedListRelationFilter
  }, "id">

  export type ComputedUpdateOutboxOrderByWithAggregationInput = {
    id?: SortOrder
    baseId?: SortOrder
    seedTableId?: SortOrder
    seedRecordIds?: SortOrderInput | SortOrder
    changeType?: SortOrder
    steps?: SortOrderInput | SortOrder
    edges?: SortOrderInput | SortOrder
    status?: SortOrder
    attempts?: SortOrder
    maxAttempts?: SortOrder
    nextRunAt?: SortOrder
    lockedAt?: SortOrderInput | SortOrder
    lockedBy?: SortOrderInput | SortOrder
    lastError?: SortOrderInput | SortOrder
    estimatedComplexity?: SortOrder
    planHash?: SortOrder
    dirtyStats?: SortOrderInput | SortOrder
    runId?: SortOrder
    originRunIds?: SortOrder
    runTotalSteps?: SortOrder
    runCompletedStepsBefore?: SortOrder
    affectedTableIds?: SortOrder
    affectedFieldIds?: SortOrder
    syncMaxLevel?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: ComputedUpdateOutboxCountOrderByAggregateInput
    _avg?: ComputedUpdateOutboxAvgOrderByAggregateInput
    _max?: ComputedUpdateOutboxMaxOrderByAggregateInput
    _min?: ComputedUpdateOutboxMinOrderByAggregateInput
    _sum?: ComputedUpdateOutboxSumOrderByAggregateInput
  }

  export type ComputedUpdateOutboxScalarWhereWithAggregatesInput = {
    AND?: ComputedUpdateOutboxScalarWhereWithAggregatesInput | ComputedUpdateOutboxScalarWhereWithAggregatesInput[]
    OR?: ComputedUpdateOutboxScalarWhereWithAggregatesInput[]
    NOT?: ComputedUpdateOutboxScalarWhereWithAggregatesInput | ComputedUpdateOutboxScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"ComputedUpdateOutbox"> | string
    baseId?: StringWithAggregatesFilter<"ComputedUpdateOutbox"> | string
    seedTableId?: StringWithAggregatesFilter<"ComputedUpdateOutbox"> | string
    seedRecordIds?: JsonNullableWithAggregatesFilter<"ComputedUpdateOutbox">
    changeType?: StringWithAggregatesFilter<"ComputedUpdateOutbox"> | string
    steps?: JsonNullableWithAggregatesFilter<"ComputedUpdateOutbox">
    edges?: JsonNullableWithAggregatesFilter<"ComputedUpdateOutbox">
    status?: StringWithAggregatesFilter<"ComputedUpdateOutbox"> | string
    attempts?: IntWithAggregatesFilter<"ComputedUpdateOutbox"> | number
    maxAttempts?: IntWithAggregatesFilter<"ComputedUpdateOutbox"> | number
    nextRunAt?: DateTimeWithAggregatesFilter<"ComputedUpdateOutbox"> | Date | string
    lockedAt?: DateTimeNullableWithAggregatesFilter<"ComputedUpdateOutbox"> | Date | string | null
    lockedBy?: StringNullableWithAggregatesFilter<"ComputedUpdateOutbox"> | string | null
    lastError?: StringNullableWithAggregatesFilter<"ComputedUpdateOutbox"> | string | null
    estimatedComplexity?: IntWithAggregatesFilter<"ComputedUpdateOutbox"> | number
    planHash?: StringWithAggregatesFilter<"ComputedUpdateOutbox"> | string
    dirtyStats?: JsonNullableWithAggregatesFilter<"ComputedUpdateOutbox">
    runId?: StringWithAggregatesFilter<"ComputedUpdateOutbox"> | string
    originRunIds?: StringNullableListFilter<"ComputedUpdateOutbox">
    runTotalSteps?: IntWithAggregatesFilter<"ComputedUpdateOutbox"> | number
    runCompletedStepsBefore?: IntWithAggregatesFilter<"ComputedUpdateOutbox"> | number
    affectedTableIds?: StringNullableListFilter<"ComputedUpdateOutbox">
    affectedFieldIds?: StringNullableListFilter<"ComputedUpdateOutbox">
    syncMaxLevel?: IntNullableWithAggregatesFilter<"ComputedUpdateOutbox"> | number | null
    createdAt?: DateTimeWithAggregatesFilter<"ComputedUpdateOutbox"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"ComputedUpdateOutbox"> | Date | string
  }

  export type ComputedUpdateOutboxSeedWhereInput = {
    AND?: ComputedUpdateOutboxSeedWhereInput | ComputedUpdateOutboxSeedWhereInput[]
    OR?: ComputedUpdateOutboxSeedWhereInput[]
    NOT?: ComputedUpdateOutboxSeedWhereInput | ComputedUpdateOutboxSeedWhereInput[]
    id?: StringFilter<"ComputedUpdateOutboxSeed"> | string
    taskId?: StringFilter<"ComputedUpdateOutboxSeed"> | string
    tableId?: StringFilter<"ComputedUpdateOutboxSeed"> | string
    recordId?: StringFilter<"ComputedUpdateOutboxSeed"> | string
    task?: XOR<ComputedUpdateOutboxScalarRelationFilter, ComputedUpdateOutboxWhereInput>
  }

  export type ComputedUpdateOutboxSeedOrderByWithRelationInput = {
    id?: SortOrder
    taskId?: SortOrder
    tableId?: SortOrder
    recordId?: SortOrder
    task?: ComputedUpdateOutboxOrderByWithRelationInput
  }

  export type ComputedUpdateOutboxSeedWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    taskId_tableId_recordId?: ComputedUpdateOutboxSeedTaskIdTableIdRecordIdCompoundUniqueInput
    AND?: ComputedUpdateOutboxSeedWhereInput | ComputedUpdateOutboxSeedWhereInput[]
    OR?: ComputedUpdateOutboxSeedWhereInput[]
    NOT?: ComputedUpdateOutboxSeedWhereInput | ComputedUpdateOutboxSeedWhereInput[]
    taskId?: StringFilter<"ComputedUpdateOutboxSeed"> | string
    tableId?: StringFilter<"ComputedUpdateOutboxSeed"> | string
    recordId?: StringFilter<"ComputedUpdateOutboxSeed"> | string
    task?: XOR<ComputedUpdateOutboxScalarRelationFilter, ComputedUpdateOutboxWhereInput>
  }, "id" | "taskId_tableId_recordId">

  export type ComputedUpdateOutboxSeedOrderByWithAggregationInput = {
    id?: SortOrder
    taskId?: SortOrder
    tableId?: SortOrder
    recordId?: SortOrder
    _count?: ComputedUpdateOutboxSeedCountOrderByAggregateInput
    _max?: ComputedUpdateOutboxSeedMaxOrderByAggregateInput
    _min?: ComputedUpdateOutboxSeedMinOrderByAggregateInput
  }

  export type ComputedUpdateOutboxSeedScalarWhereWithAggregatesInput = {
    AND?: ComputedUpdateOutboxSeedScalarWhereWithAggregatesInput | ComputedUpdateOutboxSeedScalarWhereWithAggregatesInput[]
    OR?: ComputedUpdateOutboxSeedScalarWhereWithAggregatesInput[]
    NOT?: ComputedUpdateOutboxSeedScalarWhereWithAggregatesInput | ComputedUpdateOutboxSeedScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"ComputedUpdateOutboxSeed"> | string
    taskId?: StringWithAggregatesFilter<"ComputedUpdateOutboxSeed"> | string
    tableId?: StringWithAggregatesFilter<"ComputedUpdateOutboxSeed"> | string
    recordId?: StringWithAggregatesFilter<"ComputedUpdateOutboxSeed"> | string
  }

  export type ComputedUpdateDeadLetterWhereInput = {
    AND?: ComputedUpdateDeadLetterWhereInput | ComputedUpdateDeadLetterWhereInput[]
    OR?: ComputedUpdateDeadLetterWhereInput[]
    NOT?: ComputedUpdateDeadLetterWhereInput | ComputedUpdateDeadLetterWhereInput[]
    id?: StringFilter<"ComputedUpdateDeadLetter"> | string
    baseId?: StringFilter<"ComputedUpdateDeadLetter"> | string
    seedTableId?: StringFilter<"ComputedUpdateDeadLetter"> | string
    seedRecordIds?: JsonNullableFilter<"ComputedUpdateDeadLetter">
    changeType?: StringFilter<"ComputedUpdateDeadLetter"> | string
    steps?: JsonNullableFilter<"ComputedUpdateDeadLetter">
    edges?: JsonNullableFilter<"ComputedUpdateDeadLetter">
    status?: StringFilter<"ComputedUpdateDeadLetter"> | string
    attempts?: IntFilter<"ComputedUpdateDeadLetter"> | number
    maxAttempts?: IntFilter<"ComputedUpdateDeadLetter"> | number
    nextRunAt?: DateTimeFilter<"ComputedUpdateDeadLetter"> | Date | string
    lockedAt?: DateTimeNullableFilter<"ComputedUpdateDeadLetter"> | Date | string | null
    lockedBy?: StringNullableFilter<"ComputedUpdateDeadLetter"> | string | null
    lastError?: StringNullableFilter<"ComputedUpdateDeadLetter"> | string | null
    estimatedComplexity?: IntFilter<"ComputedUpdateDeadLetter"> | number
    planHash?: StringFilter<"ComputedUpdateDeadLetter"> | string
    dirtyStats?: JsonNullableFilter<"ComputedUpdateDeadLetter">
    runId?: StringFilter<"ComputedUpdateDeadLetter"> | string
    originRunIds?: StringNullableListFilter<"ComputedUpdateDeadLetter">
    runTotalSteps?: IntFilter<"ComputedUpdateDeadLetter"> | number
    runCompletedStepsBefore?: IntFilter<"ComputedUpdateDeadLetter"> | number
    affectedTableIds?: StringNullableListFilter<"ComputedUpdateDeadLetter">
    affectedFieldIds?: StringNullableListFilter<"ComputedUpdateDeadLetter">
    syncMaxLevel?: IntNullableFilter<"ComputedUpdateDeadLetter"> | number | null
    traceData?: JsonNullableFilter<"ComputedUpdateDeadLetter">
    failedAt?: DateTimeFilter<"ComputedUpdateDeadLetter"> | Date | string
    createdAt?: DateTimeFilter<"ComputedUpdateDeadLetter"> | Date | string
    updatedAt?: DateTimeFilter<"ComputedUpdateDeadLetter"> | Date | string
  }

  export type ComputedUpdateDeadLetterOrderByWithRelationInput = {
    id?: SortOrder
    baseId?: SortOrder
    seedTableId?: SortOrder
    seedRecordIds?: SortOrderInput | SortOrder
    changeType?: SortOrder
    steps?: SortOrderInput | SortOrder
    edges?: SortOrderInput | SortOrder
    status?: SortOrder
    attempts?: SortOrder
    maxAttempts?: SortOrder
    nextRunAt?: SortOrder
    lockedAt?: SortOrderInput | SortOrder
    lockedBy?: SortOrderInput | SortOrder
    lastError?: SortOrderInput | SortOrder
    estimatedComplexity?: SortOrder
    planHash?: SortOrder
    dirtyStats?: SortOrderInput | SortOrder
    runId?: SortOrder
    originRunIds?: SortOrder
    runTotalSteps?: SortOrder
    runCompletedStepsBefore?: SortOrder
    affectedTableIds?: SortOrder
    affectedFieldIds?: SortOrder
    syncMaxLevel?: SortOrderInput | SortOrder
    traceData?: SortOrderInput | SortOrder
    failedAt?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type ComputedUpdateDeadLetterWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: ComputedUpdateDeadLetterWhereInput | ComputedUpdateDeadLetterWhereInput[]
    OR?: ComputedUpdateDeadLetterWhereInput[]
    NOT?: ComputedUpdateDeadLetterWhereInput | ComputedUpdateDeadLetterWhereInput[]
    baseId?: StringFilter<"ComputedUpdateDeadLetter"> | string
    seedTableId?: StringFilter<"ComputedUpdateDeadLetter"> | string
    seedRecordIds?: JsonNullableFilter<"ComputedUpdateDeadLetter">
    changeType?: StringFilter<"ComputedUpdateDeadLetter"> | string
    steps?: JsonNullableFilter<"ComputedUpdateDeadLetter">
    edges?: JsonNullableFilter<"ComputedUpdateDeadLetter">
    status?: StringFilter<"ComputedUpdateDeadLetter"> | string
    attempts?: IntFilter<"ComputedUpdateDeadLetter"> | number
    maxAttempts?: IntFilter<"ComputedUpdateDeadLetter"> | number
    nextRunAt?: DateTimeFilter<"ComputedUpdateDeadLetter"> | Date | string
    lockedAt?: DateTimeNullableFilter<"ComputedUpdateDeadLetter"> | Date | string | null
    lockedBy?: StringNullableFilter<"ComputedUpdateDeadLetter"> | string | null
    lastError?: StringNullableFilter<"ComputedUpdateDeadLetter"> | string | null
    estimatedComplexity?: IntFilter<"ComputedUpdateDeadLetter"> | number
    planHash?: StringFilter<"ComputedUpdateDeadLetter"> | string
    dirtyStats?: JsonNullableFilter<"ComputedUpdateDeadLetter">
    runId?: StringFilter<"ComputedUpdateDeadLetter"> | string
    originRunIds?: StringNullableListFilter<"ComputedUpdateDeadLetter">
    runTotalSteps?: IntFilter<"ComputedUpdateDeadLetter"> | number
    runCompletedStepsBefore?: IntFilter<"ComputedUpdateDeadLetter"> | number
    affectedTableIds?: StringNullableListFilter<"ComputedUpdateDeadLetter">
    affectedFieldIds?: StringNullableListFilter<"ComputedUpdateDeadLetter">
    syncMaxLevel?: IntNullableFilter<"ComputedUpdateDeadLetter"> | number | null
    traceData?: JsonNullableFilter<"ComputedUpdateDeadLetter">
    failedAt?: DateTimeFilter<"ComputedUpdateDeadLetter"> | Date | string
    createdAt?: DateTimeFilter<"ComputedUpdateDeadLetter"> | Date | string
    updatedAt?: DateTimeFilter<"ComputedUpdateDeadLetter"> | Date | string
  }, "id">

  export type ComputedUpdateDeadLetterOrderByWithAggregationInput = {
    id?: SortOrder
    baseId?: SortOrder
    seedTableId?: SortOrder
    seedRecordIds?: SortOrderInput | SortOrder
    changeType?: SortOrder
    steps?: SortOrderInput | SortOrder
    edges?: SortOrderInput | SortOrder
    status?: SortOrder
    attempts?: SortOrder
    maxAttempts?: SortOrder
    nextRunAt?: SortOrder
    lockedAt?: SortOrderInput | SortOrder
    lockedBy?: SortOrderInput | SortOrder
    lastError?: SortOrderInput | SortOrder
    estimatedComplexity?: SortOrder
    planHash?: SortOrder
    dirtyStats?: SortOrderInput | SortOrder
    runId?: SortOrder
    originRunIds?: SortOrder
    runTotalSteps?: SortOrder
    runCompletedStepsBefore?: SortOrder
    affectedTableIds?: SortOrder
    affectedFieldIds?: SortOrder
    syncMaxLevel?: SortOrderInput | SortOrder
    traceData?: SortOrderInput | SortOrder
    failedAt?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: ComputedUpdateDeadLetterCountOrderByAggregateInput
    _avg?: ComputedUpdateDeadLetterAvgOrderByAggregateInput
    _max?: ComputedUpdateDeadLetterMaxOrderByAggregateInput
    _min?: ComputedUpdateDeadLetterMinOrderByAggregateInput
    _sum?: ComputedUpdateDeadLetterSumOrderByAggregateInput
  }

  export type ComputedUpdateDeadLetterScalarWhereWithAggregatesInput = {
    AND?: ComputedUpdateDeadLetterScalarWhereWithAggregatesInput | ComputedUpdateDeadLetterScalarWhereWithAggregatesInput[]
    OR?: ComputedUpdateDeadLetterScalarWhereWithAggregatesInput[]
    NOT?: ComputedUpdateDeadLetterScalarWhereWithAggregatesInput | ComputedUpdateDeadLetterScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"ComputedUpdateDeadLetter"> | string
    baseId?: StringWithAggregatesFilter<"ComputedUpdateDeadLetter"> | string
    seedTableId?: StringWithAggregatesFilter<"ComputedUpdateDeadLetter"> | string
    seedRecordIds?: JsonNullableWithAggregatesFilter<"ComputedUpdateDeadLetter">
    changeType?: StringWithAggregatesFilter<"ComputedUpdateDeadLetter"> | string
    steps?: JsonNullableWithAggregatesFilter<"ComputedUpdateDeadLetter">
    edges?: JsonNullableWithAggregatesFilter<"ComputedUpdateDeadLetter">
    status?: StringWithAggregatesFilter<"ComputedUpdateDeadLetter"> | string
    attempts?: IntWithAggregatesFilter<"ComputedUpdateDeadLetter"> | number
    maxAttempts?: IntWithAggregatesFilter<"ComputedUpdateDeadLetter"> | number
    nextRunAt?: DateTimeWithAggregatesFilter<"ComputedUpdateDeadLetter"> | Date | string
    lockedAt?: DateTimeNullableWithAggregatesFilter<"ComputedUpdateDeadLetter"> | Date | string | null
    lockedBy?: StringNullableWithAggregatesFilter<"ComputedUpdateDeadLetter"> | string | null
    lastError?: StringNullableWithAggregatesFilter<"ComputedUpdateDeadLetter"> | string | null
    estimatedComplexity?: IntWithAggregatesFilter<"ComputedUpdateDeadLetter"> | number
    planHash?: StringWithAggregatesFilter<"ComputedUpdateDeadLetter"> | string
    dirtyStats?: JsonNullableWithAggregatesFilter<"ComputedUpdateDeadLetter">
    runId?: StringWithAggregatesFilter<"ComputedUpdateDeadLetter"> | string
    originRunIds?: StringNullableListFilter<"ComputedUpdateDeadLetter">
    runTotalSteps?: IntWithAggregatesFilter<"ComputedUpdateDeadLetter"> | number
    runCompletedStepsBefore?: IntWithAggregatesFilter<"ComputedUpdateDeadLetter"> | number
    affectedTableIds?: StringNullableListFilter<"ComputedUpdateDeadLetter">
    affectedFieldIds?: StringNullableListFilter<"ComputedUpdateDeadLetter">
    syncMaxLevel?: IntNullableWithAggregatesFilter<"ComputedUpdateDeadLetter"> | number | null
    traceData?: JsonNullableWithAggregatesFilter<"ComputedUpdateDeadLetter">
    failedAt?: DateTimeWithAggregatesFilter<"ComputedUpdateDeadLetter"> | Date | string
    createdAt?: DateTimeWithAggregatesFilter<"ComputedUpdateDeadLetter"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"ComputedUpdateDeadLetter"> | Date | string
  }

  export type ComputedUpdatePauseScopeWhereInput = {
    AND?: ComputedUpdatePauseScopeWhereInput | ComputedUpdatePauseScopeWhereInput[]
    OR?: ComputedUpdatePauseScopeWhereInput[]
    NOT?: ComputedUpdatePauseScopeWhereInput | ComputedUpdatePauseScopeWhereInput[]
    id?: StringFilter<"ComputedUpdatePauseScope"> | string
    scopeType?: StringFilter<"ComputedUpdatePauseScope"> | string
    scopeId?: StringFilter<"ComputedUpdatePauseScope"> | string
    pausedAt?: DateTimeFilter<"ComputedUpdatePauseScope"> | Date | string
    pausedBy?: StringNullableFilter<"ComputedUpdatePauseScope"> | string | null
    resumeAt?: DateTimeNullableFilter<"ComputedUpdatePauseScope"> | Date | string | null
    reason?: StringNullableFilter<"ComputedUpdatePauseScope"> | string | null
    updatedAt?: DateTimeFilter<"ComputedUpdatePauseScope"> | Date | string
    updatedBy?: StringNullableFilter<"ComputedUpdatePauseScope"> | string | null
  }

  export type ComputedUpdatePauseScopeOrderByWithRelationInput = {
    id?: SortOrder
    scopeType?: SortOrder
    scopeId?: SortOrder
    pausedAt?: SortOrder
    pausedBy?: SortOrderInput | SortOrder
    resumeAt?: SortOrderInput | SortOrder
    reason?: SortOrderInput | SortOrder
    updatedAt?: SortOrder
    updatedBy?: SortOrderInput | SortOrder
  }

  export type ComputedUpdatePauseScopeWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    scopeType_scopeId?: ComputedUpdatePauseScopeScopeTypeScopeIdCompoundUniqueInput
    AND?: ComputedUpdatePauseScopeWhereInput | ComputedUpdatePauseScopeWhereInput[]
    OR?: ComputedUpdatePauseScopeWhereInput[]
    NOT?: ComputedUpdatePauseScopeWhereInput | ComputedUpdatePauseScopeWhereInput[]
    scopeType?: StringFilter<"ComputedUpdatePauseScope"> | string
    scopeId?: StringFilter<"ComputedUpdatePauseScope"> | string
    pausedAt?: DateTimeFilter<"ComputedUpdatePauseScope"> | Date | string
    pausedBy?: StringNullableFilter<"ComputedUpdatePauseScope"> | string | null
    resumeAt?: DateTimeNullableFilter<"ComputedUpdatePauseScope"> | Date | string | null
    reason?: StringNullableFilter<"ComputedUpdatePauseScope"> | string | null
    updatedAt?: DateTimeFilter<"ComputedUpdatePauseScope"> | Date | string
    updatedBy?: StringNullableFilter<"ComputedUpdatePauseScope"> | string | null
  }, "id" | "scopeType_scopeId">

  export type ComputedUpdatePauseScopeOrderByWithAggregationInput = {
    id?: SortOrder
    scopeType?: SortOrder
    scopeId?: SortOrder
    pausedAt?: SortOrder
    pausedBy?: SortOrderInput | SortOrder
    resumeAt?: SortOrderInput | SortOrder
    reason?: SortOrderInput | SortOrder
    updatedAt?: SortOrder
    updatedBy?: SortOrderInput | SortOrder
    _count?: ComputedUpdatePauseScopeCountOrderByAggregateInput
    _max?: ComputedUpdatePauseScopeMaxOrderByAggregateInput
    _min?: ComputedUpdatePauseScopeMinOrderByAggregateInput
  }

  export type ComputedUpdatePauseScopeScalarWhereWithAggregatesInput = {
    AND?: ComputedUpdatePauseScopeScalarWhereWithAggregatesInput | ComputedUpdatePauseScopeScalarWhereWithAggregatesInput[]
    OR?: ComputedUpdatePauseScopeScalarWhereWithAggregatesInput[]
    NOT?: ComputedUpdatePauseScopeScalarWhereWithAggregatesInput | ComputedUpdatePauseScopeScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"ComputedUpdatePauseScope"> | string
    scopeType?: StringWithAggregatesFilter<"ComputedUpdatePauseScope"> | string
    scopeId?: StringWithAggregatesFilter<"ComputedUpdatePauseScope"> | string
    pausedAt?: DateTimeWithAggregatesFilter<"ComputedUpdatePauseScope"> | Date | string
    pausedBy?: StringNullableWithAggregatesFilter<"ComputedUpdatePauseScope"> | string | null
    resumeAt?: DateTimeNullableWithAggregatesFilter<"ComputedUpdatePauseScope"> | Date | string | null
    reason?: StringNullableWithAggregatesFilter<"ComputedUpdatePauseScope"> | string | null
    updatedAt?: DateTimeWithAggregatesFilter<"ComputedUpdatePauseScope"> | Date | string
    updatedBy?: StringNullableWithAggregatesFilter<"ComputedUpdatePauseScope"> | string | null
  }

  export type ComputedFieldActivityWhereInput = {
    AND?: ComputedFieldActivityWhereInput | ComputedFieldActivityWhereInput[]
    OR?: ComputedFieldActivityWhereInput[]
    NOT?: ComputedFieldActivityWhereInput | ComputedFieldActivityWhereInput[]
    fieldId?: StringFilter<"ComputedFieldActivity"> | string
    tableId?: StringFilter<"ComputedFieldActivity"> | string
    baseId?: StringFilter<"ComputedFieldActivity"> | string
    status?: StringFilter<"ComputedFieldActivity"> | string
    activeTaskCount?: IntFilter<"ComputedFieldActivity"> | number
    processingTaskCount?: IntFilter<"ComputedFieldActivity"> | number
    generation?: BigIntFilter<"ComputedFieldActivity"> | bigint | number
    estimatedComplexity?: BigIntFilter<"ComputedFieldActivity"> | bigint | number
    estimatedDirtyRecords?: BigIntFilter<"ComputedFieldActivity"> | bigint | number
    hasAllTargetRecords?: BoolFilter<"ComputedFieldActivity"> | boolean
    queuedAt?: DateTimeNullableFilter<"ComputedFieldActivity"> | Date | string | null
    startedAt?: DateTimeNullableFilter<"ComputedFieldActivity"> | Date | string | null
    lastCompletedAt?: DateTimeNullableFilter<"ComputedFieldActivity"> | Date | string | null
    lastDurationMs?: IntNullableFilter<"ComputedFieldActivity"> | number | null
    lastError?: JsonNullableFilter<"ComputedFieldActivity">
    extensions?: JsonNullableFilter<"ComputedFieldActivity">
    updatedAt?: DateTimeFilter<"ComputedFieldActivity"> | Date | string
  }

  export type ComputedFieldActivityOrderByWithRelationInput = {
    fieldId?: SortOrder
    tableId?: SortOrder
    baseId?: SortOrder
    status?: SortOrder
    activeTaskCount?: SortOrder
    processingTaskCount?: SortOrder
    generation?: SortOrder
    estimatedComplexity?: SortOrder
    estimatedDirtyRecords?: SortOrder
    hasAllTargetRecords?: SortOrder
    queuedAt?: SortOrderInput | SortOrder
    startedAt?: SortOrderInput | SortOrder
    lastCompletedAt?: SortOrderInput | SortOrder
    lastDurationMs?: SortOrderInput | SortOrder
    lastError?: SortOrderInput | SortOrder
    extensions?: SortOrderInput | SortOrder
    updatedAt?: SortOrder
  }

  export type ComputedFieldActivityWhereUniqueInput = Prisma.AtLeast<{
    fieldId?: string
    AND?: ComputedFieldActivityWhereInput | ComputedFieldActivityWhereInput[]
    OR?: ComputedFieldActivityWhereInput[]
    NOT?: ComputedFieldActivityWhereInput | ComputedFieldActivityWhereInput[]
    tableId?: StringFilter<"ComputedFieldActivity"> | string
    baseId?: StringFilter<"ComputedFieldActivity"> | string
    status?: StringFilter<"ComputedFieldActivity"> | string
    activeTaskCount?: IntFilter<"ComputedFieldActivity"> | number
    processingTaskCount?: IntFilter<"ComputedFieldActivity"> | number
    generation?: BigIntFilter<"ComputedFieldActivity"> | bigint | number
    estimatedComplexity?: BigIntFilter<"ComputedFieldActivity"> | bigint | number
    estimatedDirtyRecords?: BigIntFilter<"ComputedFieldActivity"> | bigint | number
    hasAllTargetRecords?: BoolFilter<"ComputedFieldActivity"> | boolean
    queuedAt?: DateTimeNullableFilter<"ComputedFieldActivity"> | Date | string | null
    startedAt?: DateTimeNullableFilter<"ComputedFieldActivity"> | Date | string | null
    lastCompletedAt?: DateTimeNullableFilter<"ComputedFieldActivity"> | Date | string | null
    lastDurationMs?: IntNullableFilter<"ComputedFieldActivity"> | number | null
    lastError?: JsonNullableFilter<"ComputedFieldActivity">
    extensions?: JsonNullableFilter<"ComputedFieldActivity">
    updatedAt?: DateTimeFilter<"ComputedFieldActivity"> | Date | string
  }, "fieldId">

  export type ComputedFieldActivityOrderByWithAggregationInput = {
    fieldId?: SortOrder
    tableId?: SortOrder
    baseId?: SortOrder
    status?: SortOrder
    activeTaskCount?: SortOrder
    processingTaskCount?: SortOrder
    generation?: SortOrder
    estimatedComplexity?: SortOrder
    estimatedDirtyRecords?: SortOrder
    hasAllTargetRecords?: SortOrder
    queuedAt?: SortOrderInput | SortOrder
    startedAt?: SortOrderInput | SortOrder
    lastCompletedAt?: SortOrderInput | SortOrder
    lastDurationMs?: SortOrderInput | SortOrder
    lastError?: SortOrderInput | SortOrder
    extensions?: SortOrderInput | SortOrder
    updatedAt?: SortOrder
    _count?: ComputedFieldActivityCountOrderByAggregateInput
    _avg?: ComputedFieldActivityAvgOrderByAggregateInput
    _max?: ComputedFieldActivityMaxOrderByAggregateInput
    _min?: ComputedFieldActivityMinOrderByAggregateInput
    _sum?: ComputedFieldActivitySumOrderByAggregateInput
  }

  export type ComputedFieldActivityScalarWhereWithAggregatesInput = {
    AND?: ComputedFieldActivityScalarWhereWithAggregatesInput | ComputedFieldActivityScalarWhereWithAggregatesInput[]
    OR?: ComputedFieldActivityScalarWhereWithAggregatesInput[]
    NOT?: ComputedFieldActivityScalarWhereWithAggregatesInput | ComputedFieldActivityScalarWhereWithAggregatesInput[]
    fieldId?: StringWithAggregatesFilter<"ComputedFieldActivity"> | string
    tableId?: StringWithAggregatesFilter<"ComputedFieldActivity"> | string
    baseId?: StringWithAggregatesFilter<"ComputedFieldActivity"> | string
    status?: StringWithAggregatesFilter<"ComputedFieldActivity"> | string
    activeTaskCount?: IntWithAggregatesFilter<"ComputedFieldActivity"> | number
    processingTaskCount?: IntWithAggregatesFilter<"ComputedFieldActivity"> | number
    generation?: BigIntWithAggregatesFilter<"ComputedFieldActivity"> | bigint | number
    estimatedComplexity?: BigIntWithAggregatesFilter<"ComputedFieldActivity"> | bigint | number
    estimatedDirtyRecords?: BigIntWithAggregatesFilter<"ComputedFieldActivity"> | bigint | number
    hasAllTargetRecords?: BoolWithAggregatesFilter<"ComputedFieldActivity"> | boolean
    queuedAt?: DateTimeNullableWithAggregatesFilter<"ComputedFieldActivity"> | Date | string | null
    startedAt?: DateTimeNullableWithAggregatesFilter<"ComputedFieldActivity"> | Date | string | null
    lastCompletedAt?: DateTimeNullableWithAggregatesFilter<"ComputedFieldActivity"> | Date | string | null
    lastDurationMs?: IntNullableWithAggregatesFilter<"ComputedFieldActivity"> | number | null
    lastError?: JsonNullableWithAggregatesFilter<"ComputedFieldActivity">
    extensions?: JsonNullableWithAggregatesFilter<"ComputedFieldActivity">
    updatedAt?: DateTimeWithAggregatesFilter<"ComputedFieldActivity"> | Date | string
  }

  export type ComputedTableActivityWhereInput = {
    AND?: ComputedTableActivityWhereInput | ComputedTableActivityWhereInput[]
    OR?: ComputedTableActivityWhereInput[]
    NOT?: ComputedTableActivityWhereInput | ComputedTableActivityWhereInput[]
    tableId?: StringFilter<"ComputedTableActivity"> | string
    baseId?: StringFilter<"ComputedTableActivity"> | string
    status?: StringFilter<"ComputedTableActivity"> | string
    calculatingFieldCount?: IntFilter<"ComputedTableActivity"> | number
    queuedFieldCount?: IntFilter<"ComputedTableActivity"> | number
    estimatedComplexity?: BigIntFilter<"ComputedTableActivity"> | bigint | number
    recentCompletions?: JsonFilter<"ComputedTableActivity">
    generation?: BigIntFilter<"ComputedTableActivity"> | bigint | number
    updatedAt?: DateTimeFilter<"ComputedTableActivity"> | Date | string
  }

  export type ComputedTableActivityOrderByWithRelationInput = {
    tableId?: SortOrder
    baseId?: SortOrder
    status?: SortOrder
    calculatingFieldCount?: SortOrder
    queuedFieldCount?: SortOrder
    estimatedComplexity?: SortOrder
    recentCompletions?: SortOrder
    generation?: SortOrder
    updatedAt?: SortOrder
  }

  export type ComputedTableActivityWhereUniqueInput = Prisma.AtLeast<{
    tableId?: string
    AND?: ComputedTableActivityWhereInput | ComputedTableActivityWhereInput[]
    OR?: ComputedTableActivityWhereInput[]
    NOT?: ComputedTableActivityWhereInput | ComputedTableActivityWhereInput[]
    baseId?: StringFilter<"ComputedTableActivity"> | string
    status?: StringFilter<"ComputedTableActivity"> | string
    calculatingFieldCount?: IntFilter<"ComputedTableActivity"> | number
    queuedFieldCount?: IntFilter<"ComputedTableActivity"> | number
    estimatedComplexity?: BigIntFilter<"ComputedTableActivity"> | bigint | number
    recentCompletions?: JsonFilter<"ComputedTableActivity">
    generation?: BigIntFilter<"ComputedTableActivity"> | bigint | number
    updatedAt?: DateTimeFilter<"ComputedTableActivity"> | Date | string
  }, "tableId">

  export type ComputedTableActivityOrderByWithAggregationInput = {
    tableId?: SortOrder
    baseId?: SortOrder
    status?: SortOrder
    calculatingFieldCount?: SortOrder
    queuedFieldCount?: SortOrder
    estimatedComplexity?: SortOrder
    recentCompletions?: SortOrder
    generation?: SortOrder
    updatedAt?: SortOrder
    _count?: ComputedTableActivityCountOrderByAggregateInput
    _avg?: ComputedTableActivityAvgOrderByAggregateInput
    _max?: ComputedTableActivityMaxOrderByAggregateInput
    _min?: ComputedTableActivityMinOrderByAggregateInput
    _sum?: ComputedTableActivitySumOrderByAggregateInput
  }

  export type ComputedTableActivityScalarWhereWithAggregatesInput = {
    AND?: ComputedTableActivityScalarWhereWithAggregatesInput | ComputedTableActivityScalarWhereWithAggregatesInput[]
    OR?: ComputedTableActivityScalarWhereWithAggregatesInput[]
    NOT?: ComputedTableActivityScalarWhereWithAggregatesInput | ComputedTableActivityScalarWhereWithAggregatesInput[]
    tableId?: StringWithAggregatesFilter<"ComputedTableActivity"> | string
    baseId?: StringWithAggregatesFilter<"ComputedTableActivity"> | string
    status?: StringWithAggregatesFilter<"ComputedTableActivity"> | string
    calculatingFieldCount?: IntWithAggregatesFilter<"ComputedTableActivity"> | number
    queuedFieldCount?: IntWithAggregatesFilter<"ComputedTableActivity"> | number
    estimatedComplexity?: BigIntWithAggregatesFilter<"ComputedTableActivity"> | bigint | number
    recentCompletions?: JsonWithAggregatesFilter<"ComputedTableActivity">
    generation?: BigIntWithAggregatesFilter<"ComputedTableActivity"> | bigint | number
    updatedAt?: DateTimeWithAggregatesFilter<"ComputedTableActivity"> | Date | string
  }

  export type ComputedTaskFieldRefWhereInput = {
    AND?: ComputedTaskFieldRefWhereInput | ComputedTaskFieldRefWhereInput[]
    OR?: ComputedTaskFieldRefWhereInput[]
    NOT?: ComputedTaskFieldRefWhereInput | ComputedTaskFieldRefWhereInput[]
    taskId?: StringFilter<"ComputedTaskFieldRef"> | string
    fieldId?: StringFilter<"ComputedTaskFieldRef"> | string
    tableId?: StringFilter<"ComputedTaskFieldRef"> | string
    baseId?: StringFilter<"ComputedTaskFieldRef"> | string
    wasProcessing?: BoolFilter<"ComputedTaskFieldRef"> | boolean
    createdAt?: DateTimeFilter<"ComputedTaskFieldRef"> | Date | string
  }

  export type ComputedTaskFieldRefOrderByWithRelationInput = {
    taskId?: SortOrder
    fieldId?: SortOrder
    tableId?: SortOrder
    baseId?: SortOrder
    wasProcessing?: SortOrder
    createdAt?: SortOrder
  }

  export type ComputedTaskFieldRefWhereUniqueInput = Prisma.AtLeast<{
    taskId_fieldId?: ComputedTaskFieldRefTaskIdFieldIdCompoundUniqueInput
    AND?: ComputedTaskFieldRefWhereInput | ComputedTaskFieldRefWhereInput[]
    OR?: ComputedTaskFieldRefWhereInput[]
    NOT?: ComputedTaskFieldRefWhereInput | ComputedTaskFieldRefWhereInput[]
    taskId?: StringFilter<"ComputedTaskFieldRef"> | string
    fieldId?: StringFilter<"ComputedTaskFieldRef"> | string
    tableId?: StringFilter<"ComputedTaskFieldRef"> | string
    baseId?: StringFilter<"ComputedTaskFieldRef"> | string
    wasProcessing?: BoolFilter<"ComputedTaskFieldRef"> | boolean
    createdAt?: DateTimeFilter<"ComputedTaskFieldRef"> | Date | string
  }, "taskId_fieldId">

  export type ComputedTaskFieldRefOrderByWithAggregationInput = {
    taskId?: SortOrder
    fieldId?: SortOrder
    tableId?: SortOrder
    baseId?: SortOrder
    wasProcessing?: SortOrder
    createdAt?: SortOrder
    _count?: ComputedTaskFieldRefCountOrderByAggregateInput
    _max?: ComputedTaskFieldRefMaxOrderByAggregateInput
    _min?: ComputedTaskFieldRefMinOrderByAggregateInput
  }

  export type ComputedTaskFieldRefScalarWhereWithAggregatesInput = {
    AND?: ComputedTaskFieldRefScalarWhereWithAggregatesInput | ComputedTaskFieldRefScalarWhereWithAggregatesInput[]
    OR?: ComputedTaskFieldRefScalarWhereWithAggregatesInput[]
    NOT?: ComputedTaskFieldRefScalarWhereWithAggregatesInput | ComputedTaskFieldRefScalarWhereWithAggregatesInput[]
    taskId?: StringWithAggregatesFilter<"ComputedTaskFieldRef"> | string
    fieldId?: StringWithAggregatesFilter<"ComputedTaskFieldRef"> | string
    tableId?: StringWithAggregatesFilter<"ComputedTaskFieldRef"> | string
    baseId?: StringWithAggregatesFilter<"ComputedTaskFieldRef"> | string
    wasProcessing?: BoolWithAggregatesFilter<"ComputedTaskFieldRef"> | boolean
    createdAt?: DateTimeWithAggregatesFilter<"ComputedTaskFieldRef"> | Date | string
  }

  export type RecordHistoryWhereInput = {
    AND?: RecordHistoryWhereInput | RecordHistoryWhereInput[]
    OR?: RecordHistoryWhereInput[]
    NOT?: RecordHistoryWhereInput | RecordHistoryWhereInput[]
    id?: StringFilter<"RecordHistory"> | string
    tableId?: StringFilter<"RecordHistory"> | string
    recordId?: StringFilter<"RecordHistory"> | string
    fieldId?: StringFilter<"RecordHistory"> | string
    before?: StringFilter<"RecordHistory"> | string
    after?: StringFilter<"RecordHistory"> | string
    createdTime?: DateTimeFilter<"RecordHistory"> | Date | string
    createdBy?: StringFilter<"RecordHistory"> | string
  }

  export type RecordHistoryOrderByWithRelationInput = {
    id?: SortOrder
    tableId?: SortOrder
    recordId?: SortOrder
    fieldId?: SortOrder
    before?: SortOrder
    after?: SortOrder
    createdTime?: SortOrder
    createdBy?: SortOrder
  }

  export type RecordHistoryWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: RecordHistoryWhereInput | RecordHistoryWhereInput[]
    OR?: RecordHistoryWhereInput[]
    NOT?: RecordHistoryWhereInput | RecordHistoryWhereInput[]
    tableId?: StringFilter<"RecordHistory"> | string
    recordId?: StringFilter<"RecordHistory"> | string
    fieldId?: StringFilter<"RecordHistory"> | string
    before?: StringFilter<"RecordHistory"> | string
    after?: StringFilter<"RecordHistory"> | string
    createdTime?: DateTimeFilter<"RecordHistory"> | Date | string
    createdBy?: StringFilter<"RecordHistory"> | string
  }, "id">

  export type RecordHistoryOrderByWithAggregationInput = {
    id?: SortOrder
    tableId?: SortOrder
    recordId?: SortOrder
    fieldId?: SortOrder
    before?: SortOrder
    after?: SortOrder
    createdTime?: SortOrder
    createdBy?: SortOrder
    _count?: RecordHistoryCountOrderByAggregateInput
    _max?: RecordHistoryMaxOrderByAggregateInput
    _min?: RecordHistoryMinOrderByAggregateInput
  }

  export type RecordHistoryScalarWhereWithAggregatesInput = {
    AND?: RecordHistoryScalarWhereWithAggregatesInput | RecordHistoryScalarWhereWithAggregatesInput[]
    OR?: RecordHistoryScalarWhereWithAggregatesInput[]
    NOT?: RecordHistoryScalarWhereWithAggregatesInput | RecordHistoryScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"RecordHistory"> | string
    tableId?: StringWithAggregatesFilter<"RecordHistory"> | string
    recordId?: StringWithAggregatesFilter<"RecordHistory"> | string
    fieldId?: StringWithAggregatesFilter<"RecordHistory"> | string
    before?: StringWithAggregatesFilter<"RecordHistory"> | string
    after?: StringWithAggregatesFilter<"RecordHistory"> | string
    createdTime?: DateTimeWithAggregatesFilter<"RecordHistory"> | Date | string
    createdBy?: StringWithAggregatesFilter<"RecordHistory"> | string
  }

  export type TableTrashWhereInput = {
    AND?: TableTrashWhereInput | TableTrashWhereInput[]
    OR?: TableTrashWhereInput[]
    NOT?: TableTrashWhereInput | TableTrashWhereInput[]
    id?: StringFilter<"TableTrash"> | string
    tableId?: StringFilter<"TableTrash"> | string
    resourceType?: StringFilter<"TableTrash"> | string
    snapshot?: StringFilter<"TableTrash"> | string
    createdTime?: DateTimeFilter<"TableTrash"> | Date | string
    createdBy?: StringFilter<"TableTrash"> | string
  }

  export type TableTrashOrderByWithRelationInput = {
    id?: SortOrder
    tableId?: SortOrder
    resourceType?: SortOrder
    snapshot?: SortOrder
    createdTime?: SortOrder
    createdBy?: SortOrder
  }

  export type TableTrashWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: TableTrashWhereInput | TableTrashWhereInput[]
    OR?: TableTrashWhereInput[]
    NOT?: TableTrashWhereInput | TableTrashWhereInput[]
    tableId?: StringFilter<"TableTrash"> | string
    resourceType?: StringFilter<"TableTrash"> | string
    snapshot?: StringFilter<"TableTrash"> | string
    createdTime?: DateTimeFilter<"TableTrash"> | Date | string
    createdBy?: StringFilter<"TableTrash"> | string
  }, "id">

  export type TableTrashOrderByWithAggregationInput = {
    id?: SortOrder
    tableId?: SortOrder
    resourceType?: SortOrder
    snapshot?: SortOrder
    createdTime?: SortOrder
    createdBy?: SortOrder
    _count?: TableTrashCountOrderByAggregateInput
    _max?: TableTrashMaxOrderByAggregateInput
    _min?: TableTrashMinOrderByAggregateInput
  }

  export type TableTrashScalarWhereWithAggregatesInput = {
    AND?: TableTrashScalarWhereWithAggregatesInput | TableTrashScalarWhereWithAggregatesInput[]
    OR?: TableTrashScalarWhereWithAggregatesInput[]
    NOT?: TableTrashScalarWhereWithAggregatesInput | TableTrashScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"TableTrash"> | string
    tableId?: StringWithAggregatesFilter<"TableTrash"> | string
    resourceType?: StringWithAggregatesFilter<"TableTrash"> | string
    snapshot?: StringWithAggregatesFilter<"TableTrash"> | string
    createdTime?: DateTimeWithAggregatesFilter<"TableTrash"> | Date | string
    createdBy?: StringWithAggregatesFilter<"TableTrash"> | string
  }

  export type RecordTrashWhereInput = {
    AND?: RecordTrashWhereInput | RecordTrashWhereInput[]
    OR?: RecordTrashWhereInput[]
    NOT?: RecordTrashWhereInput | RecordTrashWhereInput[]
    id?: StringFilter<"RecordTrash"> | string
    tableId?: StringFilter<"RecordTrash"> | string
    recordId?: StringFilter<"RecordTrash"> | string
    snapshot?: StringFilter<"RecordTrash"> | string
    createdTime?: DateTimeFilter<"RecordTrash"> | Date | string
    createdBy?: StringFilter<"RecordTrash"> | string
  }

  export type RecordTrashOrderByWithRelationInput = {
    id?: SortOrder
    tableId?: SortOrder
    recordId?: SortOrder
    snapshot?: SortOrder
    createdTime?: SortOrder
    createdBy?: SortOrder
  }

  export type RecordTrashWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: RecordTrashWhereInput | RecordTrashWhereInput[]
    OR?: RecordTrashWhereInput[]
    NOT?: RecordTrashWhereInput | RecordTrashWhereInput[]
    tableId?: StringFilter<"RecordTrash"> | string
    recordId?: StringFilter<"RecordTrash"> | string
    snapshot?: StringFilter<"RecordTrash"> | string
    createdTime?: DateTimeFilter<"RecordTrash"> | Date | string
    createdBy?: StringFilter<"RecordTrash"> | string
  }, "id">

  export type RecordTrashOrderByWithAggregationInput = {
    id?: SortOrder
    tableId?: SortOrder
    recordId?: SortOrder
    snapshot?: SortOrder
    createdTime?: SortOrder
    createdBy?: SortOrder
    _count?: RecordTrashCountOrderByAggregateInput
    _max?: RecordTrashMaxOrderByAggregateInput
    _min?: RecordTrashMinOrderByAggregateInput
  }

  export type RecordTrashScalarWhereWithAggregatesInput = {
    AND?: RecordTrashScalarWhereWithAggregatesInput | RecordTrashScalarWhereWithAggregatesInput[]
    OR?: RecordTrashScalarWhereWithAggregatesInput[]
    NOT?: RecordTrashScalarWhereWithAggregatesInput | RecordTrashScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"RecordTrash"> | string
    tableId?: StringWithAggregatesFilter<"RecordTrash"> | string
    recordId?: StringWithAggregatesFilter<"RecordTrash"> | string
    snapshot?: StringWithAggregatesFilter<"RecordTrash"> | string
    createdTime?: DateTimeWithAggregatesFilter<"RecordTrash"> | Date | string
    createdBy?: StringWithAggregatesFilter<"RecordTrash"> | string
  }

  export type AttachmentsWhereInput = {
    AND?: AttachmentsWhereInput | AttachmentsWhereInput[]
    OR?: AttachmentsWhereInput[]
    NOT?: AttachmentsWhereInput | AttachmentsWhereInput[]
    id?: StringFilter<"Attachments"> | string
    token?: StringFilter<"Attachments"> | string
    hash?: StringFilter<"Attachments"> | string
    size?: BigIntFilter<"Attachments"> | bigint | number
    mimetype?: StringFilter<"Attachments"> | string
    path?: StringFilter<"Attachments"> | string
    width?: IntNullableFilter<"Attachments"> | number | null
    height?: IntNullableFilter<"Attachments"> | number | null
    deletedTime?: DateTimeNullableFilter<"Attachments"> | Date | string | null
    createdTime?: DateTimeFilter<"Attachments"> | Date | string
    createdBy?: StringFilter<"Attachments"> | string
    lastModifiedBy?: StringNullableFilter<"Attachments"> | string | null
    thumbnailPath?: StringNullableFilter<"Attachments"> | string | null
  }

  export type AttachmentsOrderByWithRelationInput = {
    id?: SortOrder
    token?: SortOrder
    hash?: SortOrder
    size?: SortOrder
    mimetype?: SortOrder
    path?: SortOrder
    width?: SortOrderInput | SortOrder
    height?: SortOrderInput | SortOrder
    deletedTime?: SortOrderInput | SortOrder
    createdTime?: SortOrder
    createdBy?: SortOrder
    lastModifiedBy?: SortOrderInput | SortOrder
    thumbnailPath?: SortOrderInput | SortOrder
  }

  export type AttachmentsWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    token?: string
    AND?: AttachmentsWhereInput | AttachmentsWhereInput[]
    OR?: AttachmentsWhereInput[]
    NOT?: AttachmentsWhereInput | AttachmentsWhereInput[]
    hash?: StringFilter<"Attachments"> | string
    size?: BigIntFilter<"Attachments"> | bigint | number
    mimetype?: StringFilter<"Attachments"> | string
    path?: StringFilter<"Attachments"> | string
    width?: IntNullableFilter<"Attachments"> | number | null
    height?: IntNullableFilter<"Attachments"> | number | null
    deletedTime?: DateTimeNullableFilter<"Attachments"> | Date | string | null
    createdTime?: DateTimeFilter<"Attachments"> | Date | string
    createdBy?: StringFilter<"Attachments"> | string
    lastModifiedBy?: StringNullableFilter<"Attachments"> | string | null
    thumbnailPath?: StringNullableFilter<"Attachments"> | string | null
  }, "id" | "token">

  export type AttachmentsOrderByWithAggregationInput = {
    id?: SortOrder
    token?: SortOrder
    hash?: SortOrder
    size?: SortOrder
    mimetype?: SortOrder
    path?: SortOrder
    width?: SortOrderInput | SortOrder
    height?: SortOrderInput | SortOrder
    deletedTime?: SortOrderInput | SortOrder
    createdTime?: SortOrder
    createdBy?: SortOrder
    lastModifiedBy?: SortOrderInput | SortOrder
    thumbnailPath?: SortOrderInput | SortOrder
    _count?: AttachmentsCountOrderByAggregateInput
    _avg?: AttachmentsAvgOrderByAggregateInput
    _max?: AttachmentsMaxOrderByAggregateInput
    _min?: AttachmentsMinOrderByAggregateInput
    _sum?: AttachmentsSumOrderByAggregateInput
  }

  export type AttachmentsScalarWhereWithAggregatesInput = {
    AND?: AttachmentsScalarWhereWithAggregatesInput | AttachmentsScalarWhereWithAggregatesInput[]
    OR?: AttachmentsScalarWhereWithAggregatesInput[]
    NOT?: AttachmentsScalarWhereWithAggregatesInput | AttachmentsScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Attachments"> | string
    token?: StringWithAggregatesFilter<"Attachments"> | string
    hash?: StringWithAggregatesFilter<"Attachments"> | string
    size?: BigIntWithAggregatesFilter<"Attachments"> | bigint | number
    mimetype?: StringWithAggregatesFilter<"Attachments"> | string
    path?: StringWithAggregatesFilter<"Attachments"> | string
    width?: IntNullableWithAggregatesFilter<"Attachments"> | number | null
    height?: IntNullableWithAggregatesFilter<"Attachments"> | number | null
    deletedTime?: DateTimeNullableWithAggregatesFilter<"Attachments"> | Date | string | null
    createdTime?: DateTimeWithAggregatesFilter<"Attachments"> | Date | string
    createdBy?: StringWithAggregatesFilter<"Attachments"> | string
    lastModifiedBy?: StringNullableWithAggregatesFilter<"Attachments"> | string | null
    thumbnailPath?: StringNullableWithAggregatesFilter<"Attachments"> | string | null
  }

  export type AttachmentsTableWhereInput = {
    AND?: AttachmentsTableWhereInput | AttachmentsTableWhereInput[]
    OR?: AttachmentsTableWhereInput[]
    NOT?: AttachmentsTableWhereInput | AttachmentsTableWhereInput[]
    id?: StringFilter<"AttachmentsTable"> | string
    attachmentId?: StringFilter<"AttachmentsTable"> | string
    name?: StringFilter<"AttachmentsTable"> | string
    token?: StringFilter<"AttachmentsTable"> | string
    tableId?: StringFilter<"AttachmentsTable"> | string
    recordId?: StringFilter<"AttachmentsTable"> | string
    fieldId?: StringFilter<"AttachmentsTable"> | string
    createdTime?: DateTimeFilter<"AttachmentsTable"> | Date | string
    createdBy?: StringFilter<"AttachmentsTable"> | string
    lastModifiedBy?: StringNullableFilter<"AttachmentsTable"> | string | null
    lastModifiedTime?: DateTimeNullableFilter<"AttachmentsTable"> | Date | string | null
  }

  export type AttachmentsTableOrderByWithRelationInput = {
    id?: SortOrder
    attachmentId?: SortOrder
    name?: SortOrder
    token?: SortOrder
    tableId?: SortOrder
    recordId?: SortOrder
    fieldId?: SortOrder
    createdTime?: SortOrder
    createdBy?: SortOrder
    lastModifiedBy?: SortOrderInput | SortOrder
    lastModifiedTime?: SortOrderInput | SortOrder
  }

  export type AttachmentsTableWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: AttachmentsTableWhereInput | AttachmentsTableWhereInput[]
    OR?: AttachmentsTableWhereInput[]
    NOT?: AttachmentsTableWhereInput | AttachmentsTableWhereInput[]
    attachmentId?: StringFilter<"AttachmentsTable"> | string
    name?: StringFilter<"AttachmentsTable"> | string
    token?: StringFilter<"AttachmentsTable"> | string
    tableId?: StringFilter<"AttachmentsTable"> | string
    recordId?: StringFilter<"AttachmentsTable"> | string
    fieldId?: StringFilter<"AttachmentsTable"> | string
    createdTime?: DateTimeFilter<"AttachmentsTable"> | Date | string
    createdBy?: StringFilter<"AttachmentsTable"> | string
    lastModifiedBy?: StringNullableFilter<"AttachmentsTable"> | string | null
    lastModifiedTime?: DateTimeNullableFilter<"AttachmentsTable"> | Date | string | null
  }, "id">

  export type AttachmentsTableOrderByWithAggregationInput = {
    id?: SortOrder
    attachmentId?: SortOrder
    name?: SortOrder
    token?: SortOrder
    tableId?: SortOrder
    recordId?: SortOrder
    fieldId?: SortOrder
    createdTime?: SortOrder
    createdBy?: SortOrder
    lastModifiedBy?: SortOrderInput | SortOrder
    lastModifiedTime?: SortOrderInput | SortOrder
    _count?: AttachmentsTableCountOrderByAggregateInput
    _max?: AttachmentsTableMaxOrderByAggregateInput
    _min?: AttachmentsTableMinOrderByAggregateInput
  }

  export type AttachmentsTableScalarWhereWithAggregatesInput = {
    AND?: AttachmentsTableScalarWhereWithAggregatesInput | AttachmentsTableScalarWhereWithAggregatesInput[]
    OR?: AttachmentsTableScalarWhereWithAggregatesInput[]
    NOT?: AttachmentsTableScalarWhereWithAggregatesInput | AttachmentsTableScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"AttachmentsTable"> | string
    attachmentId?: StringWithAggregatesFilter<"AttachmentsTable"> | string
    name?: StringWithAggregatesFilter<"AttachmentsTable"> | string
    token?: StringWithAggregatesFilter<"AttachmentsTable"> | string
    tableId?: StringWithAggregatesFilter<"AttachmentsTable"> | string
    recordId?: StringWithAggregatesFilter<"AttachmentsTable"> | string
    fieldId?: StringWithAggregatesFilter<"AttachmentsTable"> | string
    createdTime?: DateTimeWithAggregatesFilter<"AttachmentsTable"> | Date | string
    createdBy?: StringWithAggregatesFilter<"AttachmentsTable"> | string
    lastModifiedBy?: StringNullableWithAggregatesFilter<"AttachmentsTable"> | string | null
    lastModifiedTime?: DateTimeNullableWithAggregatesFilter<"AttachmentsTable"> | Date | string | null
  }

  export type ComputedUpdateOutboxCreateInput = {
    id?: string
    baseId: string
    seedTableId: string
    seedRecordIds?: NullableJsonNullValueInput | InputJsonValue
    changeType: string
    steps?: NullableJsonNullValueInput | InputJsonValue
    edges?: NullableJsonNullValueInput | InputJsonValue
    status: string
    attempts?: number
    maxAttempts?: number
    nextRunAt?: Date | string
    lockedAt?: Date | string | null
    lockedBy?: string | null
    lastError?: string | null
    estimatedComplexity?: number
    planHash: string
    dirtyStats?: NullableJsonNullValueInput | InputJsonValue
    runId: string
    originRunIds?: ComputedUpdateOutboxCreateoriginRunIdsInput | string[]
    runTotalSteps?: number
    runCompletedStepsBefore?: number
    affectedTableIds?: ComputedUpdateOutboxCreateaffectedTableIdsInput | string[]
    affectedFieldIds?: ComputedUpdateOutboxCreateaffectedFieldIdsInput | string[]
    syncMaxLevel?: number | null
    createdAt?: Date | string
    updatedAt?: Date | string
    seeds?: ComputedUpdateOutboxSeedCreateNestedManyWithoutTaskInput
  }

  export type ComputedUpdateOutboxUncheckedCreateInput = {
    id?: string
    baseId: string
    seedTableId: string
    seedRecordIds?: NullableJsonNullValueInput | InputJsonValue
    changeType: string
    steps?: NullableJsonNullValueInput | InputJsonValue
    edges?: NullableJsonNullValueInput | InputJsonValue
    status: string
    attempts?: number
    maxAttempts?: number
    nextRunAt?: Date | string
    lockedAt?: Date | string | null
    lockedBy?: string | null
    lastError?: string | null
    estimatedComplexity?: number
    planHash: string
    dirtyStats?: NullableJsonNullValueInput | InputJsonValue
    runId: string
    originRunIds?: ComputedUpdateOutboxCreateoriginRunIdsInput | string[]
    runTotalSteps?: number
    runCompletedStepsBefore?: number
    affectedTableIds?: ComputedUpdateOutboxCreateaffectedTableIdsInput | string[]
    affectedFieldIds?: ComputedUpdateOutboxCreateaffectedFieldIdsInput | string[]
    syncMaxLevel?: number | null
    createdAt?: Date | string
    updatedAt?: Date | string
    seeds?: ComputedUpdateOutboxSeedUncheckedCreateNestedManyWithoutTaskInput
  }

  export type ComputedUpdateOutboxUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    baseId?: StringFieldUpdateOperationsInput | string
    seedTableId?: StringFieldUpdateOperationsInput | string
    seedRecordIds?: NullableJsonNullValueInput | InputJsonValue
    changeType?: StringFieldUpdateOperationsInput | string
    steps?: NullableJsonNullValueInput | InputJsonValue
    edges?: NullableJsonNullValueInput | InputJsonValue
    status?: StringFieldUpdateOperationsInput | string
    attempts?: IntFieldUpdateOperationsInput | number
    maxAttempts?: IntFieldUpdateOperationsInput | number
    nextRunAt?: DateTimeFieldUpdateOperationsInput | Date | string
    lockedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    lockedBy?: NullableStringFieldUpdateOperationsInput | string | null
    lastError?: NullableStringFieldUpdateOperationsInput | string | null
    estimatedComplexity?: IntFieldUpdateOperationsInput | number
    planHash?: StringFieldUpdateOperationsInput | string
    dirtyStats?: NullableJsonNullValueInput | InputJsonValue
    runId?: StringFieldUpdateOperationsInput | string
    originRunIds?: ComputedUpdateOutboxUpdateoriginRunIdsInput | string[]
    runTotalSteps?: IntFieldUpdateOperationsInput | number
    runCompletedStepsBefore?: IntFieldUpdateOperationsInput | number
    affectedTableIds?: ComputedUpdateOutboxUpdateaffectedTableIdsInput | string[]
    affectedFieldIds?: ComputedUpdateOutboxUpdateaffectedFieldIdsInput | string[]
    syncMaxLevel?: NullableIntFieldUpdateOperationsInput | number | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    seeds?: ComputedUpdateOutboxSeedUpdateManyWithoutTaskNestedInput
  }

  export type ComputedUpdateOutboxUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    baseId?: StringFieldUpdateOperationsInput | string
    seedTableId?: StringFieldUpdateOperationsInput | string
    seedRecordIds?: NullableJsonNullValueInput | InputJsonValue
    changeType?: StringFieldUpdateOperationsInput | string
    steps?: NullableJsonNullValueInput | InputJsonValue
    edges?: NullableJsonNullValueInput | InputJsonValue
    status?: StringFieldUpdateOperationsInput | string
    attempts?: IntFieldUpdateOperationsInput | number
    maxAttempts?: IntFieldUpdateOperationsInput | number
    nextRunAt?: DateTimeFieldUpdateOperationsInput | Date | string
    lockedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    lockedBy?: NullableStringFieldUpdateOperationsInput | string | null
    lastError?: NullableStringFieldUpdateOperationsInput | string | null
    estimatedComplexity?: IntFieldUpdateOperationsInput | number
    planHash?: StringFieldUpdateOperationsInput | string
    dirtyStats?: NullableJsonNullValueInput | InputJsonValue
    runId?: StringFieldUpdateOperationsInput | string
    originRunIds?: ComputedUpdateOutboxUpdateoriginRunIdsInput | string[]
    runTotalSteps?: IntFieldUpdateOperationsInput | number
    runCompletedStepsBefore?: IntFieldUpdateOperationsInput | number
    affectedTableIds?: ComputedUpdateOutboxUpdateaffectedTableIdsInput | string[]
    affectedFieldIds?: ComputedUpdateOutboxUpdateaffectedFieldIdsInput | string[]
    syncMaxLevel?: NullableIntFieldUpdateOperationsInput | number | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    seeds?: ComputedUpdateOutboxSeedUncheckedUpdateManyWithoutTaskNestedInput
  }

  export type ComputedUpdateOutboxCreateManyInput = {
    id?: string
    baseId: string
    seedTableId: string
    seedRecordIds?: NullableJsonNullValueInput | InputJsonValue
    changeType: string
    steps?: NullableJsonNullValueInput | InputJsonValue
    edges?: NullableJsonNullValueInput | InputJsonValue
    status: string
    attempts?: number
    maxAttempts?: number
    nextRunAt?: Date | string
    lockedAt?: Date | string | null
    lockedBy?: string | null
    lastError?: string | null
    estimatedComplexity?: number
    planHash: string
    dirtyStats?: NullableJsonNullValueInput | InputJsonValue
    runId: string
    originRunIds?: ComputedUpdateOutboxCreateoriginRunIdsInput | string[]
    runTotalSteps?: number
    runCompletedStepsBefore?: number
    affectedTableIds?: ComputedUpdateOutboxCreateaffectedTableIdsInput | string[]
    affectedFieldIds?: ComputedUpdateOutboxCreateaffectedFieldIdsInput | string[]
    syncMaxLevel?: number | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type ComputedUpdateOutboxUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    baseId?: StringFieldUpdateOperationsInput | string
    seedTableId?: StringFieldUpdateOperationsInput | string
    seedRecordIds?: NullableJsonNullValueInput | InputJsonValue
    changeType?: StringFieldUpdateOperationsInput | string
    steps?: NullableJsonNullValueInput | InputJsonValue
    edges?: NullableJsonNullValueInput | InputJsonValue
    status?: StringFieldUpdateOperationsInput | string
    attempts?: IntFieldUpdateOperationsInput | number
    maxAttempts?: IntFieldUpdateOperationsInput | number
    nextRunAt?: DateTimeFieldUpdateOperationsInput | Date | string
    lockedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    lockedBy?: NullableStringFieldUpdateOperationsInput | string | null
    lastError?: NullableStringFieldUpdateOperationsInput | string | null
    estimatedComplexity?: IntFieldUpdateOperationsInput | number
    planHash?: StringFieldUpdateOperationsInput | string
    dirtyStats?: NullableJsonNullValueInput | InputJsonValue
    runId?: StringFieldUpdateOperationsInput | string
    originRunIds?: ComputedUpdateOutboxUpdateoriginRunIdsInput | string[]
    runTotalSteps?: IntFieldUpdateOperationsInput | number
    runCompletedStepsBefore?: IntFieldUpdateOperationsInput | number
    affectedTableIds?: ComputedUpdateOutboxUpdateaffectedTableIdsInput | string[]
    affectedFieldIds?: ComputedUpdateOutboxUpdateaffectedFieldIdsInput | string[]
    syncMaxLevel?: NullableIntFieldUpdateOperationsInput | number | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ComputedUpdateOutboxUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    baseId?: StringFieldUpdateOperationsInput | string
    seedTableId?: StringFieldUpdateOperationsInput | string
    seedRecordIds?: NullableJsonNullValueInput | InputJsonValue
    changeType?: StringFieldUpdateOperationsInput | string
    steps?: NullableJsonNullValueInput | InputJsonValue
    edges?: NullableJsonNullValueInput | InputJsonValue
    status?: StringFieldUpdateOperationsInput | string
    attempts?: IntFieldUpdateOperationsInput | number
    maxAttempts?: IntFieldUpdateOperationsInput | number
    nextRunAt?: DateTimeFieldUpdateOperationsInput | Date | string
    lockedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    lockedBy?: NullableStringFieldUpdateOperationsInput | string | null
    lastError?: NullableStringFieldUpdateOperationsInput | string | null
    estimatedComplexity?: IntFieldUpdateOperationsInput | number
    planHash?: StringFieldUpdateOperationsInput | string
    dirtyStats?: NullableJsonNullValueInput | InputJsonValue
    runId?: StringFieldUpdateOperationsInput | string
    originRunIds?: ComputedUpdateOutboxUpdateoriginRunIdsInput | string[]
    runTotalSteps?: IntFieldUpdateOperationsInput | number
    runCompletedStepsBefore?: IntFieldUpdateOperationsInput | number
    affectedTableIds?: ComputedUpdateOutboxUpdateaffectedTableIdsInput | string[]
    affectedFieldIds?: ComputedUpdateOutboxUpdateaffectedFieldIdsInput | string[]
    syncMaxLevel?: NullableIntFieldUpdateOperationsInput | number | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ComputedUpdateOutboxSeedCreateInput = {
    id?: string
    tableId: string
    recordId: string
    task: ComputedUpdateOutboxCreateNestedOneWithoutSeedsInput
  }

  export type ComputedUpdateOutboxSeedUncheckedCreateInput = {
    id?: string
    taskId: string
    tableId: string
    recordId: string
  }

  export type ComputedUpdateOutboxSeedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    tableId?: StringFieldUpdateOperationsInput | string
    recordId?: StringFieldUpdateOperationsInput | string
    task?: ComputedUpdateOutboxUpdateOneRequiredWithoutSeedsNestedInput
  }

  export type ComputedUpdateOutboxSeedUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    taskId?: StringFieldUpdateOperationsInput | string
    tableId?: StringFieldUpdateOperationsInput | string
    recordId?: StringFieldUpdateOperationsInput | string
  }

  export type ComputedUpdateOutboxSeedCreateManyInput = {
    id?: string
    taskId: string
    tableId: string
    recordId: string
  }

  export type ComputedUpdateOutboxSeedUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    tableId?: StringFieldUpdateOperationsInput | string
    recordId?: StringFieldUpdateOperationsInput | string
  }

  export type ComputedUpdateOutboxSeedUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    taskId?: StringFieldUpdateOperationsInput | string
    tableId?: StringFieldUpdateOperationsInput | string
    recordId?: StringFieldUpdateOperationsInput | string
  }

  export type ComputedUpdateDeadLetterCreateInput = {
    id: string
    baseId: string
    seedTableId: string
    seedRecordIds?: NullableJsonNullValueInput | InputJsonValue
    changeType: string
    steps?: NullableJsonNullValueInput | InputJsonValue
    edges?: NullableJsonNullValueInput | InputJsonValue
    status: string
    attempts?: number
    maxAttempts?: number
    nextRunAt: Date | string
    lockedAt?: Date | string | null
    lockedBy?: string | null
    lastError?: string | null
    estimatedComplexity?: number
    planHash: string
    dirtyStats?: NullableJsonNullValueInput | InputJsonValue
    runId: string
    originRunIds?: ComputedUpdateDeadLetterCreateoriginRunIdsInput | string[]
    runTotalSteps?: number
    runCompletedStepsBefore?: number
    affectedTableIds?: ComputedUpdateDeadLetterCreateaffectedTableIdsInput | string[]
    affectedFieldIds?: ComputedUpdateDeadLetterCreateaffectedFieldIdsInput | string[]
    syncMaxLevel?: number | null
    traceData?: NullableJsonNullValueInput | InputJsonValue
    failedAt: Date | string
    createdAt: Date | string
    updatedAt: Date | string
  }

  export type ComputedUpdateDeadLetterUncheckedCreateInput = {
    id: string
    baseId: string
    seedTableId: string
    seedRecordIds?: NullableJsonNullValueInput | InputJsonValue
    changeType: string
    steps?: NullableJsonNullValueInput | InputJsonValue
    edges?: NullableJsonNullValueInput | InputJsonValue
    status: string
    attempts?: number
    maxAttempts?: number
    nextRunAt: Date | string
    lockedAt?: Date | string | null
    lockedBy?: string | null
    lastError?: string | null
    estimatedComplexity?: number
    planHash: string
    dirtyStats?: NullableJsonNullValueInput | InputJsonValue
    runId: string
    originRunIds?: ComputedUpdateDeadLetterCreateoriginRunIdsInput | string[]
    runTotalSteps?: number
    runCompletedStepsBefore?: number
    affectedTableIds?: ComputedUpdateDeadLetterCreateaffectedTableIdsInput | string[]
    affectedFieldIds?: ComputedUpdateDeadLetterCreateaffectedFieldIdsInput | string[]
    syncMaxLevel?: number | null
    traceData?: NullableJsonNullValueInput | InputJsonValue
    failedAt: Date | string
    createdAt: Date | string
    updatedAt: Date | string
  }

  export type ComputedUpdateDeadLetterUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    baseId?: StringFieldUpdateOperationsInput | string
    seedTableId?: StringFieldUpdateOperationsInput | string
    seedRecordIds?: NullableJsonNullValueInput | InputJsonValue
    changeType?: StringFieldUpdateOperationsInput | string
    steps?: NullableJsonNullValueInput | InputJsonValue
    edges?: NullableJsonNullValueInput | InputJsonValue
    status?: StringFieldUpdateOperationsInput | string
    attempts?: IntFieldUpdateOperationsInput | number
    maxAttempts?: IntFieldUpdateOperationsInput | number
    nextRunAt?: DateTimeFieldUpdateOperationsInput | Date | string
    lockedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    lockedBy?: NullableStringFieldUpdateOperationsInput | string | null
    lastError?: NullableStringFieldUpdateOperationsInput | string | null
    estimatedComplexity?: IntFieldUpdateOperationsInput | number
    planHash?: StringFieldUpdateOperationsInput | string
    dirtyStats?: NullableJsonNullValueInput | InputJsonValue
    runId?: StringFieldUpdateOperationsInput | string
    originRunIds?: ComputedUpdateDeadLetterUpdateoriginRunIdsInput | string[]
    runTotalSteps?: IntFieldUpdateOperationsInput | number
    runCompletedStepsBefore?: IntFieldUpdateOperationsInput | number
    affectedTableIds?: ComputedUpdateDeadLetterUpdateaffectedTableIdsInput | string[]
    affectedFieldIds?: ComputedUpdateDeadLetterUpdateaffectedFieldIdsInput | string[]
    syncMaxLevel?: NullableIntFieldUpdateOperationsInput | number | null
    traceData?: NullableJsonNullValueInput | InputJsonValue
    failedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ComputedUpdateDeadLetterUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    baseId?: StringFieldUpdateOperationsInput | string
    seedTableId?: StringFieldUpdateOperationsInput | string
    seedRecordIds?: NullableJsonNullValueInput | InputJsonValue
    changeType?: StringFieldUpdateOperationsInput | string
    steps?: NullableJsonNullValueInput | InputJsonValue
    edges?: NullableJsonNullValueInput | InputJsonValue
    status?: StringFieldUpdateOperationsInput | string
    attempts?: IntFieldUpdateOperationsInput | number
    maxAttempts?: IntFieldUpdateOperationsInput | number
    nextRunAt?: DateTimeFieldUpdateOperationsInput | Date | string
    lockedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    lockedBy?: NullableStringFieldUpdateOperationsInput | string | null
    lastError?: NullableStringFieldUpdateOperationsInput | string | null
    estimatedComplexity?: IntFieldUpdateOperationsInput | number
    planHash?: StringFieldUpdateOperationsInput | string
    dirtyStats?: NullableJsonNullValueInput | InputJsonValue
    runId?: StringFieldUpdateOperationsInput | string
    originRunIds?: ComputedUpdateDeadLetterUpdateoriginRunIdsInput | string[]
    runTotalSteps?: IntFieldUpdateOperationsInput | number
    runCompletedStepsBefore?: IntFieldUpdateOperationsInput | number
    affectedTableIds?: ComputedUpdateDeadLetterUpdateaffectedTableIdsInput | string[]
    affectedFieldIds?: ComputedUpdateDeadLetterUpdateaffectedFieldIdsInput | string[]
    syncMaxLevel?: NullableIntFieldUpdateOperationsInput | number | null
    traceData?: NullableJsonNullValueInput | InputJsonValue
    failedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ComputedUpdateDeadLetterCreateManyInput = {
    id: string
    baseId: string
    seedTableId: string
    seedRecordIds?: NullableJsonNullValueInput | InputJsonValue
    changeType: string
    steps?: NullableJsonNullValueInput | InputJsonValue
    edges?: NullableJsonNullValueInput | InputJsonValue
    status: string
    attempts?: number
    maxAttempts?: number
    nextRunAt: Date | string
    lockedAt?: Date | string | null
    lockedBy?: string | null
    lastError?: string | null
    estimatedComplexity?: number
    planHash: string
    dirtyStats?: NullableJsonNullValueInput | InputJsonValue
    runId: string
    originRunIds?: ComputedUpdateDeadLetterCreateoriginRunIdsInput | string[]
    runTotalSteps?: number
    runCompletedStepsBefore?: number
    affectedTableIds?: ComputedUpdateDeadLetterCreateaffectedTableIdsInput | string[]
    affectedFieldIds?: ComputedUpdateDeadLetterCreateaffectedFieldIdsInput | string[]
    syncMaxLevel?: number | null
    traceData?: NullableJsonNullValueInput | InputJsonValue
    failedAt: Date | string
    createdAt: Date | string
    updatedAt: Date | string
  }

  export type ComputedUpdateDeadLetterUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    baseId?: StringFieldUpdateOperationsInput | string
    seedTableId?: StringFieldUpdateOperationsInput | string
    seedRecordIds?: NullableJsonNullValueInput | InputJsonValue
    changeType?: StringFieldUpdateOperationsInput | string
    steps?: NullableJsonNullValueInput | InputJsonValue
    edges?: NullableJsonNullValueInput | InputJsonValue
    status?: StringFieldUpdateOperationsInput | string
    attempts?: IntFieldUpdateOperationsInput | number
    maxAttempts?: IntFieldUpdateOperationsInput | number
    nextRunAt?: DateTimeFieldUpdateOperationsInput | Date | string
    lockedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    lockedBy?: NullableStringFieldUpdateOperationsInput | string | null
    lastError?: NullableStringFieldUpdateOperationsInput | string | null
    estimatedComplexity?: IntFieldUpdateOperationsInput | number
    planHash?: StringFieldUpdateOperationsInput | string
    dirtyStats?: NullableJsonNullValueInput | InputJsonValue
    runId?: StringFieldUpdateOperationsInput | string
    originRunIds?: ComputedUpdateDeadLetterUpdateoriginRunIdsInput | string[]
    runTotalSteps?: IntFieldUpdateOperationsInput | number
    runCompletedStepsBefore?: IntFieldUpdateOperationsInput | number
    affectedTableIds?: ComputedUpdateDeadLetterUpdateaffectedTableIdsInput | string[]
    affectedFieldIds?: ComputedUpdateDeadLetterUpdateaffectedFieldIdsInput | string[]
    syncMaxLevel?: NullableIntFieldUpdateOperationsInput | number | null
    traceData?: NullableJsonNullValueInput | InputJsonValue
    failedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ComputedUpdateDeadLetterUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    baseId?: StringFieldUpdateOperationsInput | string
    seedTableId?: StringFieldUpdateOperationsInput | string
    seedRecordIds?: NullableJsonNullValueInput | InputJsonValue
    changeType?: StringFieldUpdateOperationsInput | string
    steps?: NullableJsonNullValueInput | InputJsonValue
    edges?: NullableJsonNullValueInput | InputJsonValue
    status?: StringFieldUpdateOperationsInput | string
    attempts?: IntFieldUpdateOperationsInput | number
    maxAttempts?: IntFieldUpdateOperationsInput | number
    nextRunAt?: DateTimeFieldUpdateOperationsInput | Date | string
    lockedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    lockedBy?: NullableStringFieldUpdateOperationsInput | string | null
    lastError?: NullableStringFieldUpdateOperationsInput | string | null
    estimatedComplexity?: IntFieldUpdateOperationsInput | number
    planHash?: StringFieldUpdateOperationsInput | string
    dirtyStats?: NullableJsonNullValueInput | InputJsonValue
    runId?: StringFieldUpdateOperationsInput | string
    originRunIds?: ComputedUpdateDeadLetterUpdateoriginRunIdsInput | string[]
    runTotalSteps?: IntFieldUpdateOperationsInput | number
    runCompletedStepsBefore?: IntFieldUpdateOperationsInput | number
    affectedTableIds?: ComputedUpdateDeadLetterUpdateaffectedTableIdsInput | string[]
    affectedFieldIds?: ComputedUpdateDeadLetterUpdateaffectedFieldIdsInput | string[]
    syncMaxLevel?: NullableIntFieldUpdateOperationsInput | number | null
    traceData?: NullableJsonNullValueInput | InputJsonValue
    failedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ComputedUpdatePauseScopeCreateInput = {
    id: string
    scopeType: string
    scopeId: string
    pausedAt?: Date | string
    pausedBy?: string | null
    resumeAt?: Date | string | null
    reason?: string | null
    updatedAt?: Date | string
    updatedBy?: string | null
  }

  export type ComputedUpdatePauseScopeUncheckedCreateInput = {
    id: string
    scopeType: string
    scopeId: string
    pausedAt?: Date | string
    pausedBy?: string | null
    resumeAt?: Date | string | null
    reason?: string | null
    updatedAt?: Date | string
    updatedBy?: string | null
  }

  export type ComputedUpdatePauseScopeUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    scopeType?: StringFieldUpdateOperationsInput | string
    scopeId?: StringFieldUpdateOperationsInput | string
    pausedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    pausedBy?: NullableStringFieldUpdateOperationsInput | string | null
    resumeAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    reason?: NullableStringFieldUpdateOperationsInput | string | null
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedBy?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type ComputedUpdatePauseScopeUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    scopeType?: StringFieldUpdateOperationsInput | string
    scopeId?: StringFieldUpdateOperationsInput | string
    pausedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    pausedBy?: NullableStringFieldUpdateOperationsInput | string | null
    resumeAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    reason?: NullableStringFieldUpdateOperationsInput | string | null
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedBy?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type ComputedUpdatePauseScopeCreateManyInput = {
    id: string
    scopeType: string
    scopeId: string
    pausedAt?: Date | string
    pausedBy?: string | null
    resumeAt?: Date | string | null
    reason?: string | null
    updatedAt?: Date | string
    updatedBy?: string | null
  }

  export type ComputedUpdatePauseScopeUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    scopeType?: StringFieldUpdateOperationsInput | string
    scopeId?: StringFieldUpdateOperationsInput | string
    pausedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    pausedBy?: NullableStringFieldUpdateOperationsInput | string | null
    resumeAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    reason?: NullableStringFieldUpdateOperationsInput | string | null
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedBy?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type ComputedUpdatePauseScopeUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    scopeType?: StringFieldUpdateOperationsInput | string
    scopeId?: StringFieldUpdateOperationsInput | string
    pausedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    pausedBy?: NullableStringFieldUpdateOperationsInput | string | null
    resumeAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    reason?: NullableStringFieldUpdateOperationsInput | string | null
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedBy?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type ComputedFieldActivityCreateInput = {
    fieldId: string
    tableId: string
    baseId: string
    status: string
    activeTaskCount?: number
    processingTaskCount?: number
    generation?: bigint | number
    estimatedComplexity?: bigint | number
    estimatedDirtyRecords?: bigint | number
    hasAllTargetRecords?: boolean
    queuedAt?: Date | string | null
    startedAt?: Date | string | null
    lastCompletedAt?: Date | string | null
    lastDurationMs?: number | null
    lastError?: NullableJsonNullValueInput | InputJsonValue
    extensions?: NullableJsonNullValueInput | InputJsonValue
    updatedAt?: Date | string
  }

  export type ComputedFieldActivityUncheckedCreateInput = {
    fieldId: string
    tableId: string
    baseId: string
    status: string
    activeTaskCount?: number
    processingTaskCount?: number
    generation?: bigint | number
    estimatedComplexity?: bigint | number
    estimatedDirtyRecords?: bigint | number
    hasAllTargetRecords?: boolean
    queuedAt?: Date | string | null
    startedAt?: Date | string | null
    lastCompletedAt?: Date | string | null
    lastDurationMs?: number | null
    lastError?: NullableJsonNullValueInput | InputJsonValue
    extensions?: NullableJsonNullValueInput | InputJsonValue
    updatedAt?: Date | string
  }

  export type ComputedFieldActivityUpdateInput = {
    fieldId?: StringFieldUpdateOperationsInput | string
    tableId?: StringFieldUpdateOperationsInput | string
    baseId?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    activeTaskCount?: IntFieldUpdateOperationsInput | number
    processingTaskCount?: IntFieldUpdateOperationsInput | number
    generation?: BigIntFieldUpdateOperationsInput | bigint | number
    estimatedComplexity?: BigIntFieldUpdateOperationsInput | bigint | number
    estimatedDirtyRecords?: BigIntFieldUpdateOperationsInput | bigint | number
    hasAllTargetRecords?: BoolFieldUpdateOperationsInput | boolean
    queuedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    lastCompletedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    lastDurationMs?: NullableIntFieldUpdateOperationsInput | number | null
    lastError?: NullableJsonNullValueInput | InputJsonValue
    extensions?: NullableJsonNullValueInput | InputJsonValue
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ComputedFieldActivityUncheckedUpdateInput = {
    fieldId?: StringFieldUpdateOperationsInput | string
    tableId?: StringFieldUpdateOperationsInput | string
    baseId?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    activeTaskCount?: IntFieldUpdateOperationsInput | number
    processingTaskCount?: IntFieldUpdateOperationsInput | number
    generation?: BigIntFieldUpdateOperationsInput | bigint | number
    estimatedComplexity?: BigIntFieldUpdateOperationsInput | bigint | number
    estimatedDirtyRecords?: BigIntFieldUpdateOperationsInput | bigint | number
    hasAllTargetRecords?: BoolFieldUpdateOperationsInput | boolean
    queuedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    lastCompletedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    lastDurationMs?: NullableIntFieldUpdateOperationsInput | number | null
    lastError?: NullableJsonNullValueInput | InputJsonValue
    extensions?: NullableJsonNullValueInput | InputJsonValue
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ComputedFieldActivityCreateManyInput = {
    fieldId: string
    tableId: string
    baseId: string
    status: string
    activeTaskCount?: number
    processingTaskCount?: number
    generation?: bigint | number
    estimatedComplexity?: bigint | number
    estimatedDirtyRecords?: bigint | number
    hasAllTargetRecords?: boolean
    queuedAt?: Date | string | null
    startedAt?: Date | string | null
    lastCompletedAt?: Date | string | null
    lastDurationMs?: number | null
    lastError?: NullableJsonNullValueInput | InputJsonValue
    extensions?: NullableJsonNullValueInput | InputJsonValue
    updatedAt?: Date | string
  }

  export type ComputedFieldActivityUpdateManyMutationInput = {
    fieldId?: StringFieldUpdateOperationsInput | string
    tableId?: StringFieldUpdateOperationsInput | string
    baseId?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    activeTaskCount?: IntFieldUpdateOperationsInput | number
    processingTaskCount?: IntFieldUpdateOperationsInput | number
    generation?: BigIntFieldUpdateOperationsInput | bigint | number
    estimatedComplexity?: BigIntFieldUpdateOperationsInput | bigint | number
    estimatedDirtyRecords?: BigIntFieldUpdateOperationsInput | bigint | number
    hasAllTargetRecords?: BoolFieldUpdateOperationsInput | boolean
    queuedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    lastCompletedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    lastDurationMs?: NullableIntFieldUpdateOperationsInput | number | null
    lastError?: NullableJsonNullValueInput | InputJsonValue
    extensions?: NullableJsonNullValueInput | InputJsonValue
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ComputedFieldActivityUncheckedUpdateManyInput = {
    fieldId?: StringFieldUpdateOperationsInput | string
    tableId?: StringFieldUpdateOperationsInput | string
    baseId?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    activeTaskCount?: IntFieldUpdateOperationsInput | number
    processingTaskCount?: IntFieldUpdateOperationsInput | number
    generation?: BigIntFieldUpdateOperationsInput | bigint | number
    estimatedComplexity?: BigIntFieldUpdateOperationsInput | bigint | number
    estimatedDirtyRecords?: BigIntFieldUpdateOperationsInput | bigint | number
    hasAllTargetRecords?: BoolFieldUpdateOperationsInput | boolean
    queuedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    lastCompletedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    lastDurationMs?: NullableIntFieldUpdateOperationsInput | number | null
    lastError?: NullableJsonNullValueInput | InputJsonValue
    extensions?: NullableJsonNullValueInput | InputJsonValue
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ComputedTableActivityCreateInput = {
    tableId: string
    baseId: string
    status: string
    calculatingFieldCount?: number
    queuedFieldCount?: number
    estimatedComplexity?: bigint | number
    recentCompletions?: JsonNullValueInput | InputJsonValue
    generation?: bigint | number
    updatedAt?: Date | string
  }

  export type ComputedTableActivityUncheckedCreateInput = {
    tableId: string
    baseId: string
    status: string
    calculatingFieldCount?: number
    queuedFieldCount?: number
    estimatedComplexity?: bigint | number
    recentCompletions?: JsonNullValueInput | InputJsonValue
    generation?: bigint | number
    updatedAt?: Date | string
  }

  export type ComputedTableActivityUpdateInput = {
    tableId?: StringFieldUpdateOperationsInput | string
    baseId?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    calculatingFieldCount?: IntFieldUpdateOperationsInput | number
    queuedFieldCount?: IntFieldUpdateOperationsInput | number
    estimatedComplexity?: BigIntFieldUpdateOperationsInput | bigint | number
    recentCompletions?: JsonNullValueInput | InputJsonValue
    generation?: BigIntFieldUpdateOperationsInput | bigint | number
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ComputedTableActivityUncheckedUpdateInput = {
    tableId?: StringFieldUpdateOperationsInput | string
    baseId?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    calculatingFieldCount?: IntFieldUpdateOperationsInput | number
    queuedFieldCount?: IntFieldUpdateOperationsInput | number
    estimatedComplexity?: BigIntFieldUpdateOperationsInput | bigint | number
    recentCompletions?: JsonNullValueInput | InputJsonValue
    generation?: BigIntFieldUpdateOperationsInput | bigint | number
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ComputedTableActivityCreateManyInput = {
    tableId: string
    baseId: string
    status: string
    calculatingFieldCount?: number
    queuedFieldCount?: number
    estimatedComplexity?: bigint | number
    recentCompletions?: JsonNullValueInput | InputJsonValue
    generation?: bigint | number
    updatedAt?: Date | string
  }

  export type ComputedTableActivityUpdateManyMutationInput = {
    tableId?: StringFieldUpdateOperationsInput | string
    baseId?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    calculatingFieldCount?: IntFieldUpdateOperationsInput | number
    queuedFieldCount?: IntFieldUpdateOperationsInput | number
    estimatedComplexity?: BigIntFieldUpdateOperationsInput | bigint | number
    recentCompletions?: JsonNullValueInput | InputJsonValue
    generation?: BigIntFieldUpdateOperationsInput | bigint | number
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ComputedTableActivityUncheckedUpdateManyInput = {
    tableId?: StringFieldUpdateOperationsInput | string
    baseId?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    calculatingFieldCount?: IntFieldUpdateOperationsInput | number
    queuedFieldCount?: IntFieldUpdateOperationsInput | number
    estimatedComplexity?: BigIntFieldUpdateOperationsInput | bigint | number
    recentCompletions?: JsonNullValueInput | InputJsonValue
    generation?: BigIntFieldUpdateOperationsInput | bigint | number
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ComputedTaskFieldRefCreateInput = {
    taskId: string
    fieldId: string
    tableId: string
    baseId: string
    wasProcessing?: boolean
    createdAt?: Date | string
  }

  export type ComputedTaskFieldRefUncheckedCreateInput = {
    taskId: string
    fieldId: string
    tableId: string
    baseId: string
    wasProcessing?: boolean
    createdAt?: Date | string
  }

  export type ComputedTaskFieldRefUpdateInput = {
    taskId?: StringFieldUpdateOperationsInput | string
    fieldId?: StringFieldUpdateOperationsInput | string
    tableId?: StringFieldUpdateOperationsInput | string
    baseId?: StringFieldUpdateOperationsInput | string
    wasProcessing?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ComputedTaskFieldRefUncheckedUpdateInput = {
    taskId?: StringFieldUpdateOperationsInput | string
    fieldId?: StringFieldUpdateOperationsInput | string
    tableId?: StringFieldUpdateOperationsInput | string
    baseId?: StringFieldUpdateOperationsInput | string
    wasProcessing?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ComputedTaskFieldRefCreateManyInput = {
    taskId: string
    fieldId: string
    tableId: string
    baseId: string
    wasProcessing?: boolean
    createdAt?: Date | string
  }

  export type ComputedTaskFieldRefUpdateManyMutationInput = {
    taskId?: StringFieldUpdateOperationsInput | string
    fieldId?: StringFieldUpdateOperationsInput | string
    tableId?: StringFieldUpdateOperationsInput | string
    baseId?: StringFieldUpdateOperationsInput | string
    wasProcessing?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ComputedTaskFieldRefUncheckedUpdateManyInput = {
    taskId?: StringFieldUpdateOperationsInput | string
    fieldId?: StringFieldUpdateOperationsInput | string
    tableId?: StringFieldUpdateOperationsInput | string
    baseId?: StringFieldUpdateOperationsInput | string
    wasProcessing?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type RecordHistoryCreateInput = {
    id?: string
    tableId: string
    recordId: string
    fieldId: string
    before: string
    after: string
    createdTime?: Date | string
    createdBy: string
  }

  export type RecordHistoryUncheckedCreateInput = {
    id?: string
    tableId: string
    recordId: string
    fieldId: string
    before: string
    after: string
    createdTime?: Date | string
    createdBy: string
  }

  export type RecordHistoryUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    tableId?: StringFieldUpdateOperationsInput | string
    recordId?: StringFieldUpdateOperationsInput | string
    fieldId?: StringFieldUpdateOperationsInput | string
    before?: StringFieldUpdateOperationsInput | string
    after?: StringFieldUpdateOperationsInput | string
    createdTime?: DateTimeFieldUpdateOperationsInput | Date | string
    createdBy?: StringFieldUpdateOperationsInput | string
  }

  export type RecordHistoryUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    tableId?: StringFieldUpdateOperationsInput | string
    recordId?: StringFieldUpdateOperationsInput | string
    fieldId?: StringFieldUpdateOperationsInput | string
    before?: StringFieldUpdateOperationsInput | string
    after?: StringFieldUpdateOperationsInput | string
    createdTime?: DateTimeFieldUpdateOperationsInput | Date | string
    createdBy?: StringFieldUpdateOperationsInput | string
  }

  export type RecordHistoryCreateManyInput = {
    id?: string
    tableId: string
    recordId: string
    fieldId: string
    before: string
    after: string
    createdTime?: Date | string
    createdBy: string
  }

  export type RecordHistoryUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    tableId?: StringFieldUpdateOperationsInput | string
    recordId?: StringFieldUpdateOperationsInput | string
    fieldId?: StringFieldUpdateOperationsInput | string
    before?: StringFieldUpdateOperationsInput | string
    after?: StringFieldUpdateOperationsInput | string
    createdTime?: DateTimeFieldUpdateOperationsInput | Date | string
    createdBy?: StringFieldUpdateOperationsInput | string
  }

  export type RecordHistoryUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    tableId?: StringFieldUpdateOperationsInput | string
    recordId?: StringFieldUpdateOperationsInput | string
    fieldId?: StringFieldUpdateOperationsInput | string
    before?: StringFieldUpdateOperationsInput | string
    after?: StringFieldUpdateOperationsInput | string
    createdTime?: DateTimeFieldUpdateOperationsInput | Date | string
    createdBy?: StringFieldUpdateOperationsInput | string
  }

  export type TableTrashCreateInput = {
    id?: string
    tableId: string
    resourceType: string
    snapshot: string
    createdTime?: Date | string
    createdBy: string
  }

  export type TableTrashUncheckedCreateInput = {
    id?: string
    tableId: string
    resourceType: string
    snapshot: string
    createdTime?: Date | string
    createdBy: string
  }

  export type TableTrashUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    tableId?: StringFieldUpdateOperationsInput | string
    resourceType?: StringFieldUpdateOperationsInput | string
    snapshot?: StringFieldUpdateOperationsInput | string
    createdTime?: DateTimeFieldUpdateOperationsInput | Date | string
    createdBy?: StringFieldUpdateOperationsInput | string
  }

  export type TableTrashUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    tableId?: StringFieldUpdateOperationsInput | string
    resourceType?: StringFieldUpdateOperationsInput | string
    snapshot?: StringFieldUpdateOperationsInput | string
    createdTime?: DateTimeFieldUpdateOperationsInput | Date | string
    createdBy?: StringFieldUpdateOperationsInput | string
  }

  export type TableTrashCreateManyInput = {
    id?: string
    tableId: string
    resourceType: string
    snapshot: string
    createdTime?: Date | string
    createdBy: string
  }

  export type TableTrashUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    tableId?: StringFieldUpdateOperationsInput | string
    resourceType?: StringFieldUpdateOperationsInput | string
    snapshot?: StringFieldUpdateOperationsInput | string
    createdTime?: DateTimeFieldUpdateOperationsInput | Date | string
    createdBy?: StringFieldUpdateOperationsInput | string
  }

  export type TableTrashUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    tableId?: StringFieldUpdateOperationsInput | string
    resourceType?: StringFieldUpdateOperationsInput | string
    snapshot?: StringFieldUpdateOperationsInput | string
    createdTime?: DateTimeFieldUpdateOperationsInput | Date | string
    createdBy?: StringFieldUpdateOperationsInput | string
  }

  export type RecordTrashCreateInput = {
    id?: string
    tableId: string
    recordId: string
    snapshot: string
    createdTime?: Date | string
    createdBy: string
  }

  export type RecordTrashUncheckedCreateInput = {
    id?: string
    tableId: string
    recordId: string
    snapshot: string
    createdTime?: Date | string
    createdBy: string
  }

  export type RecordTrashUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    tableId?: StringFieldUpdateOperationsInput | string
    recordId?: StringFieldUpdateOperationsInput | string
    snapshot?: StringFieldUpdateOperationsInput | string
    createdTime?: DateTimeFieldUpdateOperationsInput | Date | string
    createdBy?: StringFieldUpdateOperationsInput | string
  }

  export type RecordTrashUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    tableId?: StringFieldUpdateOperationsInput | string
    recordId?: StringFieldUpdateOperationsInput | string
    snapshot?: StringFieldUpdateOperationsInput | string
    createdTime?: DateTimeFieldUpdateOperationsInput | Date | string
    createdBy?: StringFieldUpdateOperationsInput | string
  }

  export type RecordTrashCreateManyInput = {
    id?: string
    tableId: string
    recordId: string
    snapshot: string
    createdTime?: Date | string
    createdBy: string
  }

  export type RecordTrashUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    tableId?: StringFieldUpdateOperationsInput | string
    recordId?: StringFieldUpdateOperationsInput | string
    snapshot?: StringFieldUpdateOperationsInput | string
    createdTime?: DateTimeFieldUpdateOperationsInput | Date | string
    createdBy?: StringFieldUpdateOperationsInput | string
  }

  export type RecordTrashUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    tableId?: StringFieldUpdateOperationsInput | string
    recordId?: StringFieldUpdateOperationsInput | string
    snapshot?: StringFieldUpdateOperationsInput | string
    createdTime?: DateTimeFieldUpdateOperationsInput | Date | string
    createdBy?: StringFieldUpdateOperationsInput | string
  }

  export type AttachmentsCreateInput = {
    id?: string
    token: string
    hash: string
    size: bigint | number
    mimetype: string
    path: string
    width?: number | null
    height?: number | null
    deletedTime?: Date | string | null
    createdTime?: Date | string
    createdBy: string
    lastModifiedBy?: string | null
    thumbnailPath?: string | null
  }

  export type AttachmentsUncheckedCreateInput = {
    id?: string
    token: string
    hash: string
    size: bigint | number
    mimetype: string
    path: string
    width?: number | null
    height?: number | null
    deletedTime?: Date | string | null
    createdTime?: Date | string
    createdBy: string
    lastModifiedBy?: string | null
    thumbnailPath?: string | null
  }

  export type AttachmentsUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    token?: StringFieldUpdateOperationsInput | string
    hash?: StringFieldUpdateOperationsInput | string
    size?: BigIntFieldUpdateOperationsInput | bigint | number
    mimetype?: StringFieldUpdateOperationsInput | string
    path?: StringFieldUpdateOperationsInput | string
    width?: NullableIntFieldUpdateOperationsInput | number | null
    height?: NullableIntFieldUpdateOperationsInput | number | null
    deletedTime?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdTime?: DateTimeFieldUpdateOperationsInput | Date | string
    createdBy?: StringFieldUpdateOperationsInput | string
    lastModifiedBy?: NullableStringFieldUpdateOperationsInput | string | null
    thumbnailPath?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type AttachmentsUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    token?: StringFieldUpdateOperationsInput | string
    hash?: StringFieldUpdateOperationsInput | string
    size?: BigIntFieldUpdateOperationsInput | bigint | number
    mimetype?: StringFieldUpdateOperationsInput | string
    path?: StringFieldUpdateOperationsInput | string
    width?: NullableIntFieldUpdateOperationsInput | number | null
    height?: NullableIntFieldUpdateOperationsInput | number | null
    deletedTime?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdTime?: DateTimeFieldUpdateOperationsInput | Date | string
    createdBy?: StringFieldUpdateOperationsInput | string
    lastModifiedBy?: NullableStringFieldUpdateOperationsInput | string | null
    thumbnailPath?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type AttachmentsCreateManyInput = {
    id?: string
    token: string
    hash: string
    size: bigint | number
    mimetype: string
    path: string
    width?: number | null
    height?: number | null
    deletedTime?: Date | string | null
    createdTime?: Date | string
    createdBy: string
    lastModifiedBy?: string | null
    thumbnailPath?: string | null
  }

  export type AttachmentsUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    token?: StringFieldUpdateOperationsInput | string
    hash?: StringFieldUpdateOperationsInput | string
    size?: BigIntFieldUpdateOperationsInput | bigint | number
    mimetype?: StringFieldUpdateOperationsInput | string
    path?: StringFieldUpdateOperationsInput | string
    width?: NullableIntFieldUpdateOperationsInput | number | null
    height?: NullableIntFieldUpdateOperationsInput | number | null
    deletedTime?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdTime?: DateTimeFieldUpdateOperationsInput | Date | string
    createdBy?: StringFieldUpdateOperationsInput | string
    lastModifiedBy?: NullableStringFieldUpdateOperationsInput | string | null
    thumbnailPath?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type AttachmentsUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    token?: StringFieldUpdateOperationsInput | string
    hash?: StringFieldUpdateOperationsInput | string
    size?: BigIntFieldUpdateOperationsInput | bigint | number
    mimetype?: StringFieldUpdateOperationsInput | string
    path?: StringFieldUpdateOperationsInput | string
    width?: NullableIntFieldUpdateOperationsInput | number | null
    height?: NullableIntFieldUpdateOperationsInput | number | null
    deletedTime?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdTime?: DateTimeFieldUpdateOperationsInput | Date | string
    createdBy?: StringFieldUpdateOperationsInput | string
    lastModifiedBy?: NullableStringFieldUpdateOperationsInput | string | null
    thumbnailPath?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type AttachmentsTableCreateInput = {
    id?: string
    attachmentId: string
    name: string
    token: string
    tableId: string
    recordId: string
    fieldId: string
    createdTime?: Date | string
    createdBy: string
    lastModifiedBy?: string | null
    lastModifiedTime?: Date | string | null
  }

  export type AttachmentsTableUncheckedCreateInput = {
    id?: string
    attachmentId: string
    name: string
    token: string
    tableId: string
    recordId: string
    fieldId: string
    createdTime?: Date | string
    createdBy: string
    lastModifiedBy?: string | null
    lastModifiedTime?: Date | string | null
  }

  export type AttachmentsTableUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    attachmentId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    token?: StringFieldUpdateOperationsInput | string
    tableId?: StringFieldUpdateOperationsInput | string
    recordId?: StringFieldUpdateOperationsInput | string
    fieldId?: StringFieldUpdateOperationsInput | string
    createdTime?: DateTimeFieldUpdateOperationsInput | Date | string
    createdBy?: StringFieldUpdateOperationsInput | string
    lastModifiedBy?: NullableStringFieldUpdateOperationsInput | string | null
    lastModifiedTime?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type AttachmentsTableUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    attachmentId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    token?: StringFieldUpdateOperationsInput | string
    tableId?: StringFieldUpdateOperationsInput | string
    recordId?: StringFieldUpdateOperationsInput | string
    fieldId?: StringFieldUpdateOperationsInput | string
    createdTime?: DateTimeFieldUpdateOperationsInput | Date | string
    createdBy?: StringFieldUpdateOperationsInput | string
    lastModifiedBy?: NullableStringFieldUpdateOperationsInput | string | null
    lastModifiedTime?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type AttachmentsTableCreateManyInput = {
    id?: string
    attachmentId: string
    name: string
    token: string
    tableId: string
    recordId: string
    fieldId: string
    createdTime?: Date | string
    createdBy: string
    lastModifiedBy?: string | null
    lastModifiedTime?: Date | string | null
  }

  export type AttachmentsTableUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    attachmentId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    token?: StringFieldUpdateOperationsInput | string
    tableId?: StringFieldUpdateOperationsInput | string
    recordId?: StringFieldUpdateOperationsInput | string
    fieldId?: StringFieldUpdateOperationsInput | string
    createdTime?: DateTimeFieldUpdateOperationsInput | Date | string
    createdBy?: StringFieldUpdateOperationsInput | string
    lastModifiedBy?: NullableStringFieldUpdateOperationsInput | string | null
    lastModifiedTime?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type AttachmentsTableUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    attachmentId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    token?: StringFieldUpdateOperationsInput | string
    tableId?: StringFieldUpdateOperationsInput | string
    recordId?: StringFieldUpdateOperationsInput | string
    fieldId?: StringFieldUpdateOperationsInput | string
    createdTime?: DateTimeFieldUpdateOperationsInput | Date | string
    createdBy?: StringFieldUpdateOperationsInput | string
    lastModifiedBy?: NullableStringFieldUpdateOperationsInput | string | null
    lastModifiedTime?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type StringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringFilter<$PrismaModel> | string
  }
  export type JsonNullableFilter<$PrismaModel = never> = 
    | PatchUndefined<
        Either<Required<JsonNullableFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonNullableFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonNullableFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonNullableFilterBase<$PrismaModel>>, 'path'>>

  export type JsonNullableFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type IntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type DateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type DateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null
  }

  export type StringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type StringNullableListFilter<$PrismaModel = never> = {
    equals?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    has?: string | StringFieldRefInput<$PrismaModel> | null
    hasEvery?: string[] | ListStringFieldRefInput<$PrismaModel>
    hasSome?: string[] | ListStringFieldRefInput<$PrismaModel>
    isEmpty?: boolean
  }

  export type IntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }

  export type ComputedUpdateOutboxSeedListRelationFilter = {
    every?: ComputedUpdateOutboxSeedWhereInput
    some?: ComputedUpdateOutboxSeedWhereInput
    none?: ComputedUpdateOutboxSeedWhereInput
  }

  export type SortOrderInput = {
    sort: SortOrder
    nulls?: NullsOrder
  }

  export type ComputedUpdateOutboxSeedOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type ComputedUpdateOutboxCountOrderByAggregateInput = {
    id?: SortOrder
    baseId?: SortOrder
    seedTableId?: SortOrder
    seedRecordIds?: SortOrder
    changeType?: SortOrder
    steps?: SortOrder
    edges?: SortOrder
    status?: SortOrder
    attempts?: SortOrder
    maxAttempts?: SortOrder
    nextRunAt?: SortOrder
    lockedAt?: SortOrder
    lockedBy?: SortOrder
    lastError?: SortOrder
    estimatedComplexity?: SortOrder
    planHash?: SortOrder
    dirtyStats?: SortOrder
    runId?: SortOrder
    originRunIds?: SortOrder
    runTotalSteps?: SortOrder
    runCompletedStepsBefore?: SortOrder
    affectedTableIds?: SortOrder
    affectedFieldIds?: SortOrder
    syncMaxLevel?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type ComputedUpdateOutboxAvgOrderByAggregateInput = {
    attempts?: SortOrder
    maxAttempts?: SortOrder
    estimatedComplexity?: SortOrder
    runTotalSteps?: SortOrder
    runCompletedStepsBefore?: SortOrder
    syncMaxLevel?: SortOrder
  }

  export type ComputedUpdateOutboxMaxOrderByAggregateInput = {
    id?: SortOrder
    baseId?: SortOrder
    seedTableId?: SortOrder
    changeType?: SortOrder
    status?: SortOrder
    attempts?: SortOrder
    maxAttempts?: SortOrder
    nextRunAt?: SortOrder
    lockedAt?: SortOrder
    lockedBy?: SortOrder
    lastError?: SortOrder
    estimatedComplexity?: SortOrder
    planHash?: SortOrder
    runId?: SortOrder
    runTotalSteps?: SortOrder
    runCompletedStepsBefore?: SortOrder
    syncMaxLevel?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type ComputedUpdateOutboxMinOrderByAggregateInput = {
    id?: SortOrder
    baseId?: SortOrder
    seedTableId?: SortOrder
    changeType?: SortOrder
    status?: SortOrder
    attempts?: SortOrder
    maxAttempts?: SortOrder
    nextRunAt?: SortOrder
    lockedAt?: SortOrder
    lockedBy?: SortOrder
    lastError?: SortOrder
    estimatedComplexity?: SortOrder
    planHash?: SortOrder
    runId?: SortOrder
    runTotalSteps?: SortOrder
    runCompletedStepsBefore?: SortOrder
    syncMaxLevel?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type ComputedUpdateOutboxSumOrderByAggregateInput = {
    attempts?: SortOrder
    maxAttempts?: SortOrder
    estimatedComplexity?: SortOrder
    runTotalSteps?: SortOrder
    runCompletedStepsBefore?: SortOrder
    syncMaxLevel?: SortOrder
  }

  export type StringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }
  export type JsonNullableWithAggregatesFilter<$PrismaModel = never> = 
    | PatchUndefined<
        Either<Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, 'path'>>

  export type JsonNullableWithAggregatesFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedJsonNullableFilter<$PrismaModel>
    _max?: NestedJsonNullableFilter<$PrismaModel>
  }

  export type IntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type DateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type DateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedDateTimeNullableFilter<$PrismaModel>
    _max?: NestedDateTimeNullableFilter<$PrismaModel>
  }

  export type StringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type IntNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableWithAggregatesFilter<$PrismaModel> | number | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedFloatNullableFilter<$PrismaModel>
    _sum?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedIntNullableFilter<$PrismaModel>
    _max?: NestedIntNullableFilter<$PrismaModel>
  }

  export type ComputedUpdateOutboxScalarRelationFilter = {
    is?: ComputedUpdateOutboxWhereInput
    isNot?: ComputedUpdateOutboxWhereInput
  }

  export type ComputedUpdateOutboxSeedTaskIdTableIdRecordIdCompoundUniqueInput = {
    taskId: string
    tableId: string
    recordId: string
  }

  export type ComputedUpdateOutboxSeedCountOrderByAggregateInput = {
    id?: SortOrder
    taskId?: SortOrder
    tableId?: SortOrder
    recordId?: SortOrder
  }

  export type ComputedUpdateOutboxSeedMaxOrderByAggregateInput = {
    id?: SortOrder
    taskId?: SortOrder
    tableId?: SortOrder
    recordId?: SortOrder
  }

  export type ComputedUpdateOutboxSeedMinOrderByAggregateInput = {
    id?: SortOrder
    taskId?: SortOrder
    tableId?: SortOrder
    recordId?: SortOrder
  }

  export type ComputedUpdateDeadLetterCountOrderByAggregateInput = {
    id?: SortOrder
    baseId?: SortOrder
    seedTableId?: SortOrder
    seedRecordIds?: SortOrder
    changeType?: SortOrder
    steps?: SortOrder
    edges?: SortOrder
    status?: SortOrder
    attempts?: SortOrder
    maxAttempts?: SortOrder
    nextRunAt?: SortOrder
    lockedAt?: SortOrder
    lockedBy?: SortOrder
    lastError?: SortOrder
    estimatedComplexity?: SortOrder
    planHash?: SortOrder
    dirtyStats?: SortOrder
    runId?: SortOrder
    originRunIds?: SortOrder
    runTotalSteps?: SortOrder
    runCompletedStepsBefore?: SortOrder
    affectedTableIds?: SortOrder
    affectedFieldIds?: SortOrder
    syncMaxLevel?: SortOrder
    traceData?: SortOrder
    failedAt?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type ComputedUpdateDeadLetterAvgOrderByAggregateInput = {
    attempts?: SortOrder
    maxAttempts?: SortOrder
    estimatedComplexity?: SortOrder
    runTotalSteps?: SortOrder
    runCompletedStepsBefore?: SortOrder
    syncMaxLevel?: SortOrder
  }

  export type ComputedUpdateDeadLetterMaxOrderByAggregateInput = {
    id?: SortOrder
    baseId?: SortOrder
    seedTableId?: SortOrder
    changeType?: SortOrder
    status?: SortOrder
    attempts?: SortOrder
    maxAttempts?: SortOrder
    nextRunAt?: SortOrder
    lockedAt?: SortOrder
    lockedBy?: SortOrder
    lastError?: SortOrder
    estimatedComplexity?: SortOrder
    planHash?: SortOrder
    runId?: SortOrder
    runTotalSteps?: SortOrder
    runCompletedStepsBefore?: SortOrder
    syncMaxLevel?: SortOrder
    failedAt?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type ComputedUpdateDeadLetterMinOrderByAggregateInput = {
    id?: SortOrder
    baseId?: SortOrder
    seedTableId?: SortOrder
    changeType?: SortOrder
    status?: SortOrder
    attempts?: SortOrder
    maxAttempts?: SortOrder
    nextRunAt?: SortOrder
    lockedAt?: SortOrder
    lockedBy?: SortOrder
    lastError?: SortOrder
    estimatedComplexity?: SortOrder
    planHash?: SortOrder
    runId?: SortOrder
    runTotalSteps?: SortOrder
    runCompletedStepsBefore?: SortOrder
    syncMaxLevel?: SortOrder
    failedAt?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type ComputedUpdateDeadLetterSumOrderByAggregateInput = {
    attempts?: SortOrder
    maxAttempts?: SortOrder
    estimatedComplexity?: SortOrder
    runTotalSteps?: SortOrder
    runCompletedStepsBefore?: SortOrder
    syncMaxLevel?: SortOrder
  }

  export type ComputedUpdatePauseScopeScopeTypeScopeIdCompoundUniqueInput = {
    scopeType: string
    scopeId: string
  }

  export type ComputedUpdatePauseScopeCountOrderByAggregateInput = {
    id?: SortOrder
    scopeType?: SortOrder
    scopeId?: SortOrder
    pausedAt?: SortOrder
    pausedBy?: SortOrder
    resumeAt?: SortOrder
    reason?: SortOrder
    updatedAt?: SortOrder
    updatedBy?: SortOrder
  }

  export type ComputedUpdatePauseScopeMaxOrderByAggregateInput = {
    id?: SortOrder
    scopeType?: SortOrder
    scopeId?: SortOrder
    pausedAt?: SortOrder
    pausedBy?: SortOrder
    resumeAt?: SortOrder
    reason?: SortOrder
    updatedAt?: SortOrder
    updatedBy?: SortOrder
  }

  export type ComputedUpdatePauseScopeMinOrderByAggregateInput = {
    id?: SortOrder
    scopeType?: SortOrder
    scopeId?: SortOrder
    pausedAt?: SortOrder
    pausedBy?: SortOrder
    resumeAt?: SortOrder
    reason?: SortOrder
    updatedAt?: SortOrder
    updatedBy?: SortOrder
  }

  export type BigIntFilter<$PrismaModel = never> = {
    equals?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    in?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel>
    notIn?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel>
    lt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    lte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    not?: NestedBigIntFilter<$PrismaModel> | bigint | number
  }

  export type BoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type ComputedFieldActivityCountOrderByAggregateInput = {
    fieldId?: SortOrder
    tableId?: SortOrder
    baseId?: SortOrder
    status?: SortOrder
    activeTaskCount?: SortOrder
    processingTaskCount?: SortOrder
    generation?: SortOrder
    estimatedComplexity?: SortOrder
    estimatedDirtyRecords?: SortOrder
    hasAllTargetRecords?: SortOrder
    queuedAt?: SortOrder
    startedAt?: SortOrder
    lastCompletedAt?: SortOrder
    lastDurationMs?: SortOrder
    lastError?: SortOrder
    extensions?: SortOrder
    updatedAt?: SortOrder
  }

  export type ComputedFieldActivityAvgOrderByAggregateInput = {
    activeTaskCount?: SortOrder
    processingTaskCount?: SortOrder
    generation?: SortOrder
    estimatedComplexity?: SortOrder
    estimatedDirtyRecords?: SortOrder
    lastDurationMs?: SortOrder
  }

  export type ComputedFieldActivityMaxOrderByAggregateInput = {
    fieldId?: SortOrder
    tableId?: SortOrder
    baseId?: SortOrder
    status?: SortOrder
    activeTaskCount?: SortOrder
    processingTaskCount?: SortOrder
    generation?: SortOrder
    estimatedComplexity?: SortOrder
    estimatedDirtyRecords?: SortOrder
    hasAllTargetRecords?: SortOrder
    queuedAt?: SortOrder
    startedAt?: SortOrder
    lastCompletedAt?: SortOrder
    lastDurationMs?: SortOrder
    updatedAt?: SortOrder
  }

  export type ComputedFieldActivityMinOrderByAggregateInput = {
    fieldId?: SortOrder
    tableId?: SortOrder
    baseId?: SortOrder
    status?: SortOrder
    activeTaskCount?: SortOrder
    processingTaskCount?: SortOrder
    generation?: SortOrder
    estimatedComplexity?: SortOrder
    estimatedDirtyRecords?: SortOrder
    hasAllTargetRecords?: SortOrder
    queuedAt?: SortOrder
    startedAt?: SortOrder
    lastCompletedAt?: SortOrder
    lastDurationMs?: SortOrder
    updatedAt?: SortOrder
  }

  export type ComputedFieldActivitySumOrderByAggregateInput = {
    activeTaskCount?: SortOrder
    processingTaskCount?: SortOrder
    generation?: SortOrder
    estimatedComplexity?: SortOrder
    estimatedDirtyRecords?: SortOrder
    lastDurationMs?: SortOrder
  }

  export type BigIntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    in?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel>
    notIn?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel>
    lt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    lte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    not?: NestedBigIntWithAggregatesFilter<$PrismaModel> | bigint | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedBigIntFilter<$PrismaModel>
    _min?: NestedBigIntFilter<$PrismaModel>
    _max?: NestedBigIntFilter<$PrismaModel>
  }

  export type BoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }
  export type JsonFilter<$PrismaModel = never> = 
    | PatchUndefined<
        Either<Required<JsonFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonFilterBase<$PrismaModel>>, 'path'>>

  export type JsonFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type ComputedTableActivityCountOrderByAggregateInput = {
    tableId?: SortOrder
    baseId?: SortOrder
    status?: SortOrder
    calculatingFieldCount?: SortOrder
    queuedFieldCount?: SortOrder
    estimatedComplexity?: SortOrder
    recentCompletions?: SortOrder
    generation?: SortOrder
    updatedAt?: SortOrder
  }

  export type ComputedTableActivityAvgOrderByAggregateInput = {
    calculatingFieldCount?: SortOrder
    queuedFieldCount?: SortOrder
    estimatedComplexity?: SortOrder
    generation?: SortOrder
  }

  export type ComputedTableActivityMaxOrderByAggregateInput = {
    tableId?: SortOrder
    baseId?: SortOrder
    status?: SortOrder
    calculatingFieldCount?: SortOrder
    queuedFieldCount?: SortOrder
    estimatedComplexity?: SortOrder
    generation?: SortOrder
    updatedAt?: SortOrder
  }

  export type ComputedTableActivityMinOrderByAggregateInput = {
    tableId?: SortOrder
    baseId?: SortOrder
    status?: SortOrder
    calculatingFieldCount?: SortOrder
    queuedFieldCount?: SortOrder
    estimatedComplexity?: SortOrder
    generation?: SortOrder
    updatedAt?: SortOrder
  }

  export type ComputedTableActivitySumOrderByAggregateInput = {
    calculatingFieldCount?: SortOrder
    queuedFieldCount?: SortOrder
    estimatedComplexity?: SortOrder
    generation?: SortOrder
  }
  export type JsonWithAggregatesFilter<$PrismaModel = never> = 
    | PatchUndefined<
        Either<Required<JsonWithAggregatesFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonWithAggregatesFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonWithAggregatesFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonWithAggregatesFilterBase<$PrismaModel>>, 'path'>>

  export type JsonWithAggregatesFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedJsonFilter<$PrismaModel>
    _max?: NestedJsonFilter<$PrismaModel>
  }

  export type ComputedTaskFieldRefTaskIdFieldIdCompoundUniqueInput = {
    taskId: string
    fieldId: string
  }

  export type ComputedTaskFieldRefCountOrderByAggregateInput = {
    taskId?: SortOrder
    fieldId?: SortOrder
    tableId?: SortOrder
    baseId?: SortOrder
    wasProcessing?: SortOrder
    createdAt?: SortOrder
  }

  export type ComputedTaskFieldRefMaxOrderByAggregateInput = {
    taskId?: SortOrder
    fieldId?: SortOrder
    tableId?: SortOrder
    baseId?: SortOrder
    wasProcessing?: SortOrder
    createdAt?: SortOrder
  }

  export type ComputedTaskFieldRefMinOrderByAggregateInput = {
    taskId?: SortOrder
    fieldId?: SortOrder
    tableId?: SortOrder
    baseId?: SortOrder
    wasProcessing?: SortOrder
    createdAt?: SortOrder
  }

  export type RecordHistoryCountOrderByAggregateInput = {
    id?: SortOrder
    tableId?: SortOrder
    recordId?: SortOrder
    fieldId?: SortOrder
    before?: SortOrder
    after?: SortOrder
    createdTime?: SortOrder
    createdBy?: SortOrder
  }

  export type RecordHistoryMaxOrderByAggregateInput = {
    id?: SortOrder
    tableId?: SortOrder
    recordId?: SortOrder
    fieldId?: SortOrder
    before?: SortOrder
    after?: SortOrder
    createdTime?: SortOrder
    createdBy?: SortOrder
  }

  export type RecordHistoryMinOrderByAggregateInput = {
    id?: SortOrder
    tableId?: SortOrder
    recordId?: SortOrder
    fieldId?: SortOrder
    before?: SortOrder
    after?: SortOrder
    createdTime?: SortOrder
    createdBy?: SortOrder
  }

  export type TableTrashCountOrderByAggregateInput = {
    id?: SortOrder
    tableId?: SortOrder
    resourceType?: SortOrder
    snapshot?: SortOrder
    createdTime?: SortOrder
    createdBy?: SortOrder
  }

  export type TableTrashMaxOrderByAggregateInput = {
    id?: SortOrder
    tableId?: SortOrder
    resourceType?: SortOrder
    snapshot?: SortOrder
    createdTime?: SortOrder
    createdBy?: SortOrder
  }

  export type TableTrashMinOrderByAggregateInput = {
    id?: SortOrder
    tableId?: SortOrder
    resourceType?: SortOrder
    snapshot?: SortOrder
    createdTime?: SortOrder
    createdBy?: SortOrder
  }

  export type RecordTrashCountOrderByAggregateInput = {
    id?: SortOrder
    tableId?: SortOrder
    recordId?: SortOrder
    snapshot?: SortOrder
    createdTime?: SortOrder
    createdBy?: SortOrder
  }

  export type RecordTrashMaxOrderByAggregateInput = {
    id?: SortOrder
    tableId?: SortOrder
    recordId?: SortOrder
    snapshot?: SortOrder
    createdTime?: SortOrder
    createdBy?: SortOrder
  }

  export type RecordTrashMinOrderByAggregateInput = {
    id?: SortOrder
    tableId?: SortOrder
    recordId?: SortOrder
    snapshot?: SortOrder
    createdTime?: SortOrder
    createdBy?: SortOrder
  }

  export type AttachmentsCountOrderByAggregateInput = {
    id?: SortOrder
    token?: SortOrder
    hash?: SortOrder
    size?: SortOrder
    mimetype?: SortOrder
    path?: SortOrder
    width?: SortOrder
    height?: SortOrder
    deletedTime?: SortOrder
    createdTime?: SortOrder
    createdBy?: SortOrder
    lastModifiedBy?: SortOrder
    thumbnailPath?: SortOrder
  }

  export type AttachmentsAvgOrderByAggregateInput = {
    size?: SortOrder
    width?: SortOrder
    height?: SortOrder
  }

  export type AttachmentsMaxOrderByAggregateInput = {
    id?: SortOrder
    token?: SortOrder
    hash?: SortOrder
    size?: SortOrder
    mimetype?: SortOrder
    path?: SortOrder
    width?: SortOrder
    height?: SortOrder
    deletedTime?: SortOrder
    createdTime?: SortOrder
    createdBy?: SortOrder
    lastModifiedBy?: SortOrder
    thumbnailPath?: SortOrder
  }

  export type AttachmentsMinOrderByAggregateInput = {
    id?: SortOrder
    token?: SortOrder
    hash?: SortOrder
    size?: SortOrder
    mimetype?: SortOrder
    path?: SortOrder
    width?: SortOrder
    height?: SortOrder
    deletedTime?: SortOrder
    createdTime?: SortOrder
    createdBy?: SortOrder
    lastModifiedBy?: SortOrder
    thumbnailPath?: SortOrder
  }

  export type AttachmentsSumOrderByAggregateInput = {
    size?: SortOrder
    width?: SortOrder
    height?: SortOrder
  }

  export type AttachmentsTableCountOrderByAggregateInput = {
    id?: SortOrder
    attachmentId?: SortOrder
    name?: SortOrder
    token?: SortOrder
    tableId?: SortOrder
    recordId?: SortOrder
    fieldId?: SortOrder
    createdTime?: SortOrder
    createdBy?: SortOrder
    lastModifiedBy?: SortOrder
    lastModifiedTime?: SortOrder
  }

  export type AttachmentsTableMaxOrderByAggregateInput = {
    id?: SortOrder
    attachmentId?: SortOrder
    name?: SortOrder
    token?: SortOrder
    tableId?: SortOrder
    recordId?: SortOrder
    fieldId?: SortOrder
    createdTime?: SortOrder
    createdBy?: SortOrder
    lastModifiedBy?: SortOrder
    lastModifiedTime?: SortOrder
  }

  export type AttachmentsTableMinOrderByAggregateInput = {
    id?: SortOrder
    attachmentId?: SortOrder
    name?: SortOrder
    token?: SortOrder
    tableId?: SortOrder
    recordId?: SortOrder
    fieldId?: SortOrder
    createdTime?: SortOrder
    createdBy?: SortOrder
    lastModifiedBy?: SortOrder
    lastModifiedTime?: SortOrder
  }

  export type ComputedUpdateOutboxCreateoriginRunIdsInput = {
    set: string[]
  }

  export type ComputedUpdateOutboxCreateaffectedTableIdsInput = {
    set: string[]
  }

  export type ComputedUpdateOutboxCreateaffectedFieldIdsInput = {
    set: string[]
  }

  export type ComputedUpdateOutboxSeedCreateNestedManyWithoutTaskInput = {
    create?: XOR<ComputedUpdateOutboxSeedCreateWithoutTaskInput, ComputedUpdateOutboxSeedUncheckedCreateWithoutTaskInput> | ComputedUpdateOutboxSeedCreateWithoutTaskInput[] | ComputedUpdateOutboxSeedUncheckedCreateWithoutTaskInput[]
    connectOrCreate?: ComputedUpdateOutboxSeedCreateOrConnectWithoutTaskInput | ComputedUpdateOutboxSeedCreateOrConnectWithoutTaskInput[]
    createMany?: ComputedUpdateOutboxSeedCreateManyTaskInputEnvelope
    connect?: ComputedUpdateOutboxSeedWhereUniqueInput | ComputedUpdateOutboxSeedWhereUniqueInput[]
  }

  export type ComputedUpdateOutboxSeedUncheckedCreateNestedManyWithoutTaskInput = {
    create?: XOR<ComputedUpdateOutboxSeedCreateWithoutTaskInput, ComputedUpdateOutboxSeedUncheckedCreateWithoutTaskInput> | ComputedUpdateOutboxSeedCreateWithoutTaskInput[] | ComputedUpdateOutboxSeedUncheckedCreateWithoutTaskInput[]
    connectOrCreate?: ComputedUpdateOutboxSeedCreateOrConnectWithoutTaskInput | ComputedUpdateOutboxSeedCreateOrConnectWithoutTaskInput[]
    createMany?: ComputedUpdateOutboxSeedCreateManyTaskInputEnvelope
    connect?: ComputedUpdateOutboxSeedWhereUniqueInput | ComputedUpdateOutboxSeedWhereUniqueInput[]
  }

  export type StringFieldUpdateOperationsInput = {
    set?: string
  }

  export type IntFieldUpdateOperationsInput = {
    set?: number
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string
  }

  export type NullableDateTimeFieldUpdateOperationsInput = {
    set?: Date | string | null
  }

  export type NullableStringFieldUpdateOperationsInput = {
    set?: string | null
  }

  export type ComputedUpdateOutboxUpdateoriginRunIdsInput = {
    set?: string[]
    push?: string | string[]
  }

  export type ComputedUpdateOutboxUpdateaffectedTableIdsInput = {
    set?: string[]
    push?: string | string[]
  }

  export type ComputedUpdateOutboxUpdateaffectedFieldIdsInput = {
    set?: string[]
    push?: string | string[]
  }

  export type NullableIntFieldUpdateOperationsInput = {
    set?: number | null
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type ComputedUpdateOutboxSeedUpdateManyWithoutTaskNestedInput = {
    create?: XOR<ComputedUpdateOutboxSeedCreateWithoutTaskInput, ComputedUpdateOutboxSeedUncheckedCreateWithoutTaskInput> | ComputedUpdateOutboxSeedCreateWithoutTaskInput[] | ComputedUpdateOutboxSeedUncheckedCreateWithoutTaskInput[]
    connectOrCreate?: ComputedUpdateOutboxSeedCreateOrConnectWithoutTaskInput | ComputedUpdateOutboxSeedCreateOrConnectWithoutTaskInput[]
    upsert?: ComputedUpdateOutboxSeedUpsertWithWhereUniqueWithoutTaskInput | ComputedUpdateOutboxSeedUpsertWithWhereUniqueWithoutTaskInput[]
    createMany?: ComputedUpdateOutboxSeedCreateManyTaskInputEnvelope
    set?: ComputedUpdateOutboxSeedWhereUniqueInput | ComputedUpdateOutboxSeedWhereUniqueInput[]
    disconnect?: ComputedUpdateOutboxSeedWhereUniqueInput | ComputedUpdateOutboxSeedWhereUniqueInput[]
    delete?: ComputedUpdateOutboxSeedWhereUniqueInput | ComputedUpdateOutboxSeedWhereUniqueInput[]
    connect?: ComputedUpdateOutboxSeedWhereUniqueInput | ComputedUpdateOutboxSeedWhereUniqueInput[]
    update?: ComputedUpdateOutboxSeedUpdateWithWhereUniqueWithoutTaskInput | ComputedUpdateOutboxSeedUpdateWithWhereUniqueWithoutTaskInput[]
    updateMany?: ComputedUpdateOutboxSeedUpdateManyWithWhereWithoutTaskInput | ComputedUpdateOutboxSeedUpdateManyWithWhereWithoutTaskInput[]
    deleteMany?: ComputedUpdateOutboxSeedScalarWhereInput | ComputedUpdateOutboxSeedScalarWhereInput[]
  }

  export type ComputedUpdateOutboxSeedUncheckedUpdateManyWithoutTaskNestedInput = {
    create?: XOR<ComputedUpdateOutboxSeedCreateWithoutTaskInput, ComputedUpdateOutboxSeedUncheckedCreateWithoutTaskInput> | ComputedUpdateOutboxSeedCreateWithoutTaskInput[] | ComputedUpdateOutboxSeedUncheckedCreateWithoutTaskInput[]
    connectOrCreate?: ComputedUpdateOutboxSeedCreateOrConnectWithoutTaskInput | ComputedUpdateOutboxSeedCreateOrConnectWithoutTaskInput[]
    upsert?: ComputedUpdateOutboxSeedUpsertWithWhereUniqueWithoutTaskInput | ComputedUpdateOutboxSeedUpsertWithWhereUniqueWithoutTaskInput[]
    createMany?: ComputedUpdateOutboxSeedCreateManyTaskInputEnvelope
    set?: ComputedUpdateOutboxSeedWhereUniqueInput | ComputedUpdateOutboxSeedWhereUniqueInput[]
    disconnect?: ComputedUpdateOutboxSeedWhereUniqueInput | ComputedUpdateOutboxSeedWhereUniqueInput[]
    delete?: ComputedUpdateOutboxSeedWhereUniqueInput | ComputedUpdateOutboxSeedWhereUniqueInput[]
    connect?: ComputedUpdateOutboxSeedWhereUniqueInput | ComputedUpdateOutboxSeedWhereUniqueInput[]
    update?: ComputedUpdateOutboxSeedUpdateWithWhereUniqueWithoutTaskInput | ComputedUpdateOutboxSeedUpdateWithWhereUniqueWithoutTaskInput[]
    updateMany?: ComputedUpdateOutboxSeedUpdateManyWithWhereWithoutTaskInput | ComputedUpdateOutboxSeedUpdateManyWithWhereWithoutTaskInput[]
    deleteMany?: ComputedUpdateOutboxSeedScalarWhereInput | ComputedUpdateOutboxSeedScalarWhereInput[]
  }

  export type ComputedUpdateOutboxCreateNestedOneWithoutSeedsInput = {
    create?: XOR<ComputedUpdateOutboxCreateWithoutSeedsInput, ComputedUpdateOutboxUncheckedCreateWithoutSeedsInput>
    connectOrCreate?: ComputedUpdateOutboxCreateOrConnectWithoutSeedsInput
    connect?: ComputedUpdateOutboxWhereUniqueInput
  }

  export type ComputedUpdateOutboxUpdateOneRequiredWithoutSeedsNestedInput = {
    create?: XOR<ComputedUpdateOutboxCreateWithoutSeedsInput, ComputedUpdateOutboxUncheckedCreateWithoutSeedsInput>
    connectOrCreate?: ComputedUpdateOutboxCreateOrConnectWithoutSeedsInput
    upsert?: ComputedUpdateOutboxUpsertWithoutSeedsInput
    connect?: ComputedUpdateOutboxWhereUniqueInput
    update?: XOR<XOR<ComputedUpdateOutboxUpdateToOneWithWhereWithoutSeedsInput, ComputedUpdateOutboxUpdateWithoutSeedsInput>, ComputedUpdateOutboxUncheckedUpdateWithoutSeedsInput>
  }

  export type ComputedUpdateDeadLetterCreateoriginRunIdsInput = {
    set: string[]
  }

  export type ComputedUpdateDeadLetterCreateaffectedTableIdsInput = {
    set: string[]
  }

  export type ComputedUpdateDeadLetterCreateaffectedFieldIdsInput = {
    set: string[]
  }

  export type ComputedUpdateDeadLetterUpdateoriginRunIdsInput = {
    set?: string[]
    push?: string | string[]
  }

  export type ComputedUpdateDeadLetterUpdateaffectedTableIdsInput = {
    set?: string[]
    push?: string | string[]
  }

  export type ComputedUpdateDeadLetterUpdateaffectedFieldIdsInput = {
    set?: string[]
    push?: string | string[]
  }

  export type BigIntFieldUpdateOperationsInput = {
    set?: bigint | number
    increment?: bigint | number
    decrement?: bigint | number
    multiply?: bigint | number
    divide?: bigint | number
  }

  export type BoolFieldUpdateOperationsInput = {
    set?: boolean
  }

  export type NestedStringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type NestedIntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type NestedDateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type NestedDateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null
  }

  export type NestedStringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type NestedIntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }

  export type NestedStringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }
  export type NestedJsonNullableFilter<$PrismaModel = never> = 
    | PatchUndefined<
        Either<Required<NestedJsonNullableFilterBase<$PrismaModel>>, Exclude<keyof Required<NestedJsonNullableFilterBase<$PrismaModel>>, 'path'>>,
        Required<NestedJsonNullableFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<NestedJsonNullableFilterBase<$PrismaModel>>, 'path'>>

  export type NestedJsonNullableFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type NestedIntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type NestedFloatFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[] | ListFloatFieldRefInput<$PrismaModel>
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel>
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatFilter<$PrismaModel> | number
  }

  export type NestedDateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type NestedDateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedDateTimeNullableFilter<$PrismaModel>
    _max?: NestedDateTimeNullableFilter<$PrismaModel>
  }

  export type NestedStringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type NestedIntNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableWithAggregatesFilter<$PrismaModel> | number | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedFloatNullableFilter<$PrismaModel>
    _sum?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedIntNullableFilter<$PrismaModel>
    _max?: NestedIntNullableFilter<$PrismaModel>
  }

  export type NestedFloatNullableFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel> | null
    in?: number[] | ListFloatFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel> | null
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatNullableFilter<$PrismaModel> | number | null
  }

  export type NestedBigIntFilter<$PrismaModel = never> = {
    equals?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    in?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel>
    notIn?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel>
    lt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    lte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    not?: NestedBigIntFilter<$PrismaModel> | bigint | number
  }

  export type NestedBoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type NestedBigIntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    in?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel>
    notIn?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel>
    lt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    lte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    not?: NestedBigIntWithAggregatesFilter<$PrismaModel> | bigint | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedBigIntFilter<$PrismaModel>
    _min?: NestedBigIntFilter<$PrismaModel>
    _max?: NestedBigIntFilter<$PrismaModel>
  }

  export type NestedBoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }
  export type NestedJsonFilter<$PrismaModel = never> = 
    | PatchUndefined<
        Either<Required<NestedJsonFilterBase<$PrismaModel>>, Exclude<keyof Required<NestedJsonFilterBase<$PrismaModel>>, 'path'>>,
        Required<NestedJsonFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<NestedJsonFilterBase<$PrismaModel>>, 'path'>>

  export type NestedJsonFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type ComputedUpdateOutboxSeedCreateWithoutTaskInput = {
    id?: string
    tableId: string
    recordId: string
  }

  export type ComputedUpdateOutboxSeedUncheckedCreateWithoutTaskInput = {
    id?: string
    tableId: string
    recordId: string
  }

  export type ComputedUpdateOutboxSeedCreateOrConnectWithoutTaskInput = {
    where: ComputedUpdateOutboxSeedWhereUniqueInput
    create: XOR<ComputedUpdateOutboxSeedCreateWithoutTaskInput, ComputedUpdateOutboxSeedUncheckedCreateWithoutTaskInput>
  }

  export type ComputedUpdateOutboxSeedCreateManyTaskInputEnvelope = {
    data: ComputedUpdateOutboxSeedCreateManyTaskInput | ComputedUpdateOutboxSeedCreateManyTaskInput[]
    skipDuplicates?: boolean
  }

  export type ComputedUpdateOutboxSeedUpsertWithWhereUniqueWithoutTaskInput = {
    where: ComputedUpdateOutboxSeedWhereUniqueInput
    update: XOR<ComputedUpdateOutboxSeedUpdateWithoutTaskInput, ComputedUpdateOutboxSeedUncheckedUpdateWithoutTaskInput>
    create: XOR<ComputedUpdateOutboxSeedCreateWithoutTaskInput, ComputedUpdateOutboxSeedUncheckedCreateWithoutTaskInput>
  }

  export type ComputedUpdateOutboxSeedUpdateWithWhereUniqueWithoutTaskInput = {
    where: ComputedUpdateOutboxSeedWhereUniqueInput
    data: XOR<ComputedUpdateOutboxSeedUpdateWithoutTaskInput, ComputedUpdateOutboxSeedUncheckedUpdateWithoutTaskInput>
  }

  export type ComputedUpdateOutboxSeedUpdateManyWithWhereWithoutTaskInput = {
    where: ComputedUpdateOutboxSeedScalarWhereInput
    data: XOR<ComputedUpdateOutboxSeedUpdateManyMutationInput, ComputedUpdateOutboxSeedUncheckedUpdateManyWithoutTaskInput>
  }

  export type ComputedUpdateOutboxSeedScalarWhereInput = {
    AND?: ComputedUpdateOutboxSeedScalarWhereInput | ComputedUpdateOutboxSeedScalarWhereInput[]
    OR?: ComputedUpdateOutboxSeedScalarWhereInput[]
    NOT?: ComputedUpdateOutboxSeedScalarWhereInput | ComputedUpdateOutboxSeedScalarWhereInput[]
    id?: StringFilter<"ComputedUpdateOutboxSeed"> | string
    taskId?: StringFilter<"ComputedUpdateOutboxSeed"> | string
    tableId?: StringFilter<"ComputedUpdateOutboxSeed"> | string
    recordId?: StringFilter<"ComputedUpdateOutboxSeed"> | string
  }

  export type ComputedUpdateOutboxCreateWithoutSeedsInput = {
    id?: string
    baseId: string
    seedTableId: string
    seedRecordIds?: NullableJsonNullValueInput | InputJsonValue
    changeType: string
    steps?: NullableJsonNullValueInput | InputJsonValue
    edges?: NullableJsonNullValueInput | InputJsonValue
    status: string
    attempts?: number
    maxAttempts?: number
    nextRunAt?: Date | string
    lockedAt?: Date | string | null
    lockedBy?: string | null
    lastError?: string | null
    estimatedComplexity?: number
    planHash: string
    dirtyStats?: NullableJsonNullValueInput | InputJsonValue
    runId: string
    originRunIds?: ComputedUpdateOutboxCreateoriginRunIdsInput | string[]
    runTotalSteps?: number
    runCompletedStepsBefore?: number
    affectedTableIds?: ComputedUpdateOutboxCreateaffectedTableIdsInput | string[]
    affectedFieldIds?: ComputedUpdateOutboxCreateaffectedFieldIdsInput | string[]
    syncMaxLevel?: number | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type ComputedUpdateOutboxUncheckedCreateWithoutSeedsInput = {
    id?: string
    baseId: string
    seedTableId: string
    seedRecordIds?: NullableJsonNullValueInput | InputJsonValue
    changeType: string
    steps?: NullableJsonNullValueInput | InputJsonValue
    edges?: NullableJsonNullValueInput | InputJsonValue
    status: string
    attempts?: number
    maxAttempts?: number
    nextRunAt?: Date | string
    lockedAt?: Date | string | null
    lockedBy?: string | null
    lastError?: string | null
    estimatedComplexity?: number
    planHash: string
    dirtyStats?: NullableJsonNullValueInput | InputJsonValue
    runId: string
    originRunIds?: ComputedUpdateOutboxCreateoriginRunIdsInput | string[]
    runTotalSteps?: number
    runCompletedStepsBefore?: number
    affectedTableIds?: ComputedUpdateOutboxCreateaffectedTableIdsInput | string[]
    affectedFieldIds?: ComputedUpdateOutboxCreateaffectedFieldIdsInput | string[]
    syncMaxLevel?: number | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type ComputedUpdateOutboxCreateOrConnectWithoutSeedsInput = {
    where: ComputedUpdateOutboxWhereUniqueInput
    create: XOR<ComputedUpdateOutboxCreateWithoutSeedsInput, ComputedUpdateOutboxUncheckedCreateWithoutSeedsInput>
  }

  export type ComputedUpdateOutboxUpsertWithoutSeedsInput = {
    update: XOR<ComputedUpdateOutboxUpdateWithoutSeedsInput, ComputedUpdateOutboxUncheckedUpdateWithoutSeedsInput>
    create: XOR<ComputedUpdateOutboxCreateWithoutSeedsInput, ComputedUpdateOutboxUncheckedCreateWithoutSeedsInput>
    where?: ComputedUpdateOutboxWhereInput
  }

  export type ComputedUpdateOutboxUpdateToOneWithWhereWithoutSeedsInput = {
    where?: ComputedUpdateOutboxWhereInput
    data: XOR<ComputedUpdateOutboxUpdateWithoutSeedsInput, ComputedUpdateOutboxUncheckedUpdateWithoutSeedsInput>
  }

  export type ComputedUpdateOutboxUpdateWithoutSeedsInput = {
    id?: StringFieldUpdateOperationsInput | string
    baseId?: StringFieldUpdateOperationsInput | string
    seedTableId?: StringFieldUpdateOperationsInput | string
    seedRecordIds?: NullableJsonNullValueInput | InputJsonValue
    changeType?: StringFieldUpdateOperationsInput | string
    steps?: NullableJsonNullValueInput | InputJsonValue
    edges?: NullableJsonNullValueInput | InputJsonValue
    status?: StringFieldUpdateOperationsInput | string
    attempts?: IntFieldUpdateOperationsInput | number
    maxAttempts?: IntFieldUpdateOperationsInput | number
    nextRunAt?: DateTimeFieldUpdateOperationsInput | Date | string
    lockedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    lockedBy?: NullableStringFieldUpdateOperationsInput | string | null
    lastError?: NullableStringFieldUpdateOperationsInput | string | null
    estimatedComplexity?: IntFieldUpdateOperationsInput | number
    planHash?: StringFieldUpdateOperationsInput | string
    dirtyStats?: NullableJsonNullValueInput | InputJsonValue
    runId?: StringFieldUpdateOperationsInput | string
    originRunIds?: ComputedUpdateOutboxUpdateoriginRunIdsInput | string[]
    runTotalSteps?: IntFieldUpdateOperationsInput | number
    runCompletedStepsBefore?: IntFieldUpdateOperationsInput | number
    affectedTableIds?: ComputedUpdateOutboxUpdateaffectedTableIdsInput | string[]
    affectedFieldIds?: ComputedUpdateOutboxUpdateaffectedFieldIdsInput | string[]
    syncMaxLevel?: NullableIntFieldUpdateOperationsInput | number | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ComputedUpdateOutboxUncheckedUpdateWithoutSeedsInput = {
    id?: StringFieldUpdateOperationsInput | string
    baseId?: StringFieldUpdateOperationsInput | string
    seedTableId?: StringFieldUpdateOperationsInput | string
    seedRecordIds?: NullableJsonNullValueInput | InputJsonValue
    changeType?: StringFieldUpdateOperationsInput | string
    steps?: NullableJsonNullValueInput | InputJsonValue
    edges?: NullableJsonNullValueInput | InputJsonValue
    status?: StringFieldUpdateOperationsInput | string
    attempts?: IntFieldUpdateOperationsInput | number
    maxAttempts?: IntFieldUpdateOperationsInput | number
    nextRunAt?: DateTimeFieldUpdateOperationsInput | Date | string
    lockedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    lockedBy?: NullableStringFieldUpdateOperationsInput | string | null
    lastError?: NullableStringFieldUpdateOperationsInput | string | null
    estimatedComplexity?: IntFieldUpdateOperationsInput | number
    planHash?: StringFieldUpdateOperationsInput | string
    dirtyStats?: NullableJsonNullValueInput | InputJsonValue
    runId?: StringFieldUpdateOperationsInput | string
    originRunIds?: ComputedUpdateOutboxUpdateoriginRunIdsInput | string[]
    runTotalSteps?: IntFieldUpdateOperationsInput | number
    runCompletedStepsBefore?: IntFieldUpdateOperationsInput | number
    affectedTableIds?: ComputedUpdateOutboxUpdateaffectedTableIdsInput | string[]
    affectedFieldIds?: ComputedUpdateOutboxUpdateaffectedFieldIdsInput | string[]
    syncMaxLevel?: NullableIntFieldUpdateOperationsInput | number | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ComputedUpdateOutboxSeedCreateManyTaskInput = {
    id?: string
    tableId: string
    recordId: string
  }

  export type ComputedUpdateOutboxSeedUpdateWithoutTaskInput = {
    id?: StringFieldUpdateOperationsInput | string
    tableId?: StringFieldUpdateOperationsInput | string
    recordId?: StringFieldUpdateOperationsInput | string
  }

  export type ComputedUpdateOutboxSeedUncheckedUpdateWithoutTaskInput = {
    id?: StringFieldUpdateOperationsInput | string
    tableId?: StringFieldUpdateOperationsInput | string
    recordId?: StringFieldUpdateOperationsInput | string
  }

  export type ComputedUpdateOutboxSeedUncheckedUpdateManyWithoutTaskInput = {
    id?: StringFieldUpdateOperationsInput | string
    tableId?: StringFieldUpdateOperationsInput | string
    recordId?: StringFieldUpdateOperationsInput | string
  }



  /**
   * Batch Payload for updateMany & deleteMany & createMany
   */

  export type BatchPayload = {
    count: number
  }

  /**
   * DMMF
   */
  export const dmmf: runtime.BaseDMMF
}