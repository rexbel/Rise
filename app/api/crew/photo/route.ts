import { readBody } from "@/lib/api"
import { CrewError, setPhoto } from "@/lib/crew"
import { authedFor, crewFail } from "@/lib/crew-http"
import { CrewPhotoRequest } from "@/lib/types"

/** Show or hide the patient's photo to their crew (recorded in the consent log). */
export async function POST(request: Request) {
  const body = await readBody(request, CrewPhotoRequest)
  if ("error" in body) return body.error
  try {
    if (!authedFor(request, body.data.riseId)) throw new CrewError("join your crew on this phone first", 401)
    return Response.json(setPhoto(body.data.riseId, body.data.showPhoto))
  } catch (e) {
    return crewFail(e)
  }
}
