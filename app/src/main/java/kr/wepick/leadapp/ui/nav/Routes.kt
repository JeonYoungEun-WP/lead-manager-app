package kr.wepick.leadapp.ui.nav

sealed class Route(val path: String, val label: String) {
    data object LeadList   : Route("leads", "잠재고객")
    data object CallLog    : Route("calls", "통화내역")
    data object Settings   : Route("settings", "설정")

    // detail — 파라미터 포함
    data object LeadDetail : Route("leads/{id}", "고객 상세") {
        fun build(id: Long) = "leads/$id"
        const val ARG_ID = "id"
    }
    data object CallDetail : Route("calls/{id}", "통화 상세") {
        fun build(id: Long) = "calls/$id"
        const val ARG_ID = "id"
    }
    data object LeadEdit   : Route("leads/edit/{id}", "고객 편집") {
        fun build(id: Long = 0) = "leads/edit/$id"
        const val ARG_ID = "id"
    }
}

val BOTTOM_NAV = listOf(Route.LeadList, Route.CallLog, Route.Settings)
