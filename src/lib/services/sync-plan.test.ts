import { describe, it, expect } from "vitest"
import { planSync, isPlanEmpty, describePlan, isQueued, type LocalVideo, type RemoteVideo } from "./sync-plan"

const local = (videoId: string, status: LocalVideo["status"] = "queued"): LocalVideo => ({
    id: `local-${videoId}`,
    videoId,
    title: `Local ${videoId}`,
    status,
})

const remote = (videoId: string, position = 0): RemoteVideo => ({
    itemId: `item-${videoId}-${position}`,
    videoId,
    title: `Remote ${videoId}`,
    position,
})

describe("sync-plan", () => {
    describe("isQueued", () => {
        it("mirrors only queued videos onto the playlist", () => {
            expect(isQueued("queued")).toBe(true)
            expect(isQueued("watched")).toBe(false)
            expect(isQueued("skipped")).toBe(false)
        })
    })

    describe("planSync — read-only (default)", () => {
        it("imports playlist videos we don't have", () => {
            const plan = planSync([], [remote("a"), remote("b", 1)])
            expect(plan.toImport.map(r => r.videoId)).toEqual(["a", "b"])
            expect(plan.toPush).toEqual([])
            expect(plan.toRemoveRemote).toEqual([])
        })

        it("does not push local additions unless asked", () => {
            const plan = planSync([local("a")], [])
            expect(plan.toPush).toEqual([])
            expect(isPlanEmpty(plan)).toBe(true)
        })

        it("counts videos present on both sides as in sync", () => {
            const plan = planSync([local("a")], [remote("a")])
            expect(plan.inSyncCount).toBe(1)
            expect(isPlanEmpty(plan)).toBe(true)
        })
    })

    describe("planSync — push enabled", () => {
        it("pushes queued videos missing from the playlist", () => {
            const plan = planSync([local("a"), local("b")], [remote("a")], { push: true })
            expect(plan.toPush.map(v => v.videoId)).toEqual(["b"])
        })

        it("never pushes watched or skipped videos", () => {
            const plan = planSync(
                [local("a", "watched"), local("b", "skipped"), local("c")],
                [],
                { push: true },
            )
            expect(plan.toPush.map(v => v.videoId)).toEqual(["c"])
        })

        it("leaves the playlist alone for watched videos when pruning is off", () => {
            const plan = planSync([local("a", "watched")], [remote("a")], { push: true })
            expect(plan.toRemoveRemote).toEqual([])
            expect(plan.inSyncCount).toBe(0)
        })
    })

    describe("planSync — pruning", () => {
        it("removes videos from the playlist once they're no longer queued", () => {
            const plan = planSync([local("a", "watched")], [remote("a")], { push: true, prune: true })
            expect(plan.toRemoveRemote.map(r => r.videoId)).toEqual(["a"])
        })

        it("keeps queued videos on the playlist", () => {
            const plan = planSync([local("a")], [remote("a")], { push: true, prune: true })
            expect(plan.toRemoveRemote).toEqual([])
        })
    })

    describe("planSync — duplicates", () => {
        it("imports a repeated unknown video only once", () => {
            const plan = planSync([], [remote("a", 0), remote("a", 1)])
            expect(plan.toImport.map(r => r.videoId)).toEqual(["a"])
        })

        it("prunes the duplicate playlist rows when pruning", () => {
            const plan = planSync([local("a")], [remote("a", 0), remote("a", 1)], { push: true, prune: true })
            expect(plan.toRemoveRemote.map(r => r.itemId)).toEqual(["item-a-1"])
            expect(plan.inSyncCount).toBe(1)
        })

        it("treats duplicate local rows as one", () => {
            const plan = planSync([local("a"), local("a")], [], { push: true })
            expect(plan.toPush).toHaveLength(1)
        })
    })

    describe("planSync — combined", () => {
        it("handles imports, pushes and prunes together", () => {
            const plan = planSync(
                [local("keep"), local("done", "watched"), local("new")],
                [remote("keep"), remote("done", 1), remote("theirs", 2)],
                { push: true, prune: true },
            )
            expect(plan.toImport.map(r => r.videoId)).toEqual(["theirs"])
            expect(plan.toPush.map(v => v.videoId)).toEqual(["new"])
            expect(plan.toRemoveRemote.map(r => r.videoId)).toEqual(["done"])
            expect(plan.inSyncCount).toBe(1)
        })
    })

    describe("describePlan", () => {
        it("reports a no-op plan", () => {
            expect(describePlan(planSync([local("a")], [remote("a")]))).toBe("Already in sync")
        })

        it("summarises each kind of change", () => {
            const plan = planSync(
                [local("done", "watched"), local("new")],
                [remote("done"), remote("theirs", 1)],
                { push: true, prune: true },
            )
            expect(describePlan(plan)).toBe("1 imported, 1 added to playlist, 1 removed from playlist")
        })
    })
})
