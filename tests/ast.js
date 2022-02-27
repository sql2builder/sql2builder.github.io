// select p.*, a.name from posts as p left join comments as c on c.post_id = p.id right join users on user.id = p.user_id left join (select * from address) as a on user.aid = a.id where (a.name = 'bejing' and a.id < 10) and c.conent = 'abc' order by c.created_at, p.created_at desc;
let complex_ast = [
    {
        "Query": {
            "with": null,
            "body": {
                "Select": {
                    "distinct": false,
                    "top": null,
                    "projection": [
                        {
                            "QualifiedWildcard": [
                                {
                                    "value": "p",
                                    "quote_style": null
                                }
                            ]
                        },
                        {
                            "UnnamedExpr": {
                                "CompoundIdentifier": [
                                    {
                                        "value": "a",
                                        "quote_style": null
                                    },
                                    {
                                        "value": "name",
                                        "quote_style": null
                                    }
                                ]
                            }
                        }
                    ],
                    "from": [
                        {
                            "relation": {
                                "Table": {
                                    "name": [
                                        {
                                            "value": "posts",
                                            "quote_style": null
                                        }
                                    ],
                                    "alias": {
                                        "name": {
                                            "value": "p",
                                            "quote_style": null
                                        },
                                        "columns": []
                                    },
                                    "args": [],
                                    "with_hints": []
                                }
                            },
                            "joins": [
                                {
                                    "relation": {
                                        "Table": {
                                            "name": [
                                                {
                                                    "value": "comments",
                                                    "quote_style": null
                                                }
                                            ],
                                            "alias": {
                                                "name": {
                                                    "value": "c",
                                                    "quote_style": null
                                                },
                                                "columns": []
                                            },
                                            "args": [],
                                            "with_hints": []
                                        }
                                    },
                                    "join_operator": {
                                        "LeftOuter": {
                                            "On": {
                                                "BinaryOp": {
                                                    "left": {
                                                        "CompoundIdentifier": [
                                                            {
                                                                "value": "c",
                                                                "quote_style": null
                                                            },
                                                            {
                                                                "value": "post_id",
                                                                "quote_style": null
                                                            }
                                                        ]
                                                    },
                                                    "op": "Eq",
                                                    "right": {
                                                        "CompoundIdentifier": [
                                                            {
                                                                "value": "p",
                                                                "quote_style": null
                                                            },
                                                            {
                                                                "value": "id",
                                                                "quote_style": null
                                                            }
                                                        ]
                                                    }
                                                }
                                            }
                                        }
                                    }
                                },
                                {
                                    "relation": {
                                        "Table": {
                                            "name": [
                                                {
                                                    "value": "users",
                                                    "quote_style": null
                                                }
                                            ],
                                            "alias": null,
                                            "args": [],
                                            "with_hints": []
                                        }
                                    },
                                    "join_operator": {
                                        "RightOuter": {
                                            "On": {
                                                "BinaryOp": {
                                                    "left": {
                                                        "CompoundIdentifier": [
                                                            {
                                                                "value": "user",
                                                                "quote_style": null
                                                            },
                                                            {
                                                                "value": "id",
                                                                "quote_style": null
                                                            }
                                                        ]
                                                    },
                                                    "op": "Eq",
                                                    "right": {
                                                        "CompoundIdentifier": [
                                                            {
                                                                "value": "p",
                                                                "quote_style": null
                                                            },
                                                            {
                                                                "value": "user_id",
                                                                "quote_style": null
                                                            }
                                                        ]
                                                    }
                                                }
                                            }
                                        }
                                    }
                                },
                                {
                                    "relation": {
                                        "Derived": {
                                            "lateral": false,
                                            "subquery": {
                                                "with": null,
                                                "body": {
                                                    "Select": {
                                                        "distinct": false,
                                                        "top": null,
                                                        "projection": [
                                                            "Wildcard"
                                                        ],
                                                        "from": [
                                                            {
                                                                "relation": {
                                                                    "Table": {
                                                                        "name": [
                                                                            {
                                                                                "value": "address",
                                                                                "quote_style": null
                                                                            }
                                                                        ],
                                                                        "alias": null,
                                                                        "args": [],
                                                                        "with_hints": []
                                                                    }
                                                                },
                                                                "joins": []
                                                            }
                                                        ],
                                                        "lateral_views": [],
                                                        "selection": null,
                                                        "group_by": [],
                                                        "cluster_by": [],
                                                        "distribute_by": [],
                                                        "sort_by": [],
                                                        "having": null
                                                    }
                                                },
                                                "order_by": [],
                                                "limit": null,
                                                "offset": null,
                                                "fetch": null
                                            },
                                            "alias": {
                                                "name": {
                                                    "value": "a",
                                                    "quote_style": null
                                                },
                                                "columns": []
                                            }
                                        }
                                    },
                                    "join_operator": {
                                        "LeftOuter": {
                                            "On": {
                                                "BinaryOp": {
                                                    "left": {
                                                        "CompoundIdentifier": [
                                                            {
                                                                "value": "user",
                                                                "quote_style": null
                                                            },
                                                            {
                                                                "value": "aid",
                                                                "quote_style": null
                                                            }
                                                        ]
                                                    },
                                                    "op": "Eq",
                                                    "right": {
                                                        "CompoundIdentifier": [
                                                            {
                                                                "value": "a",
                                                                "quote_style": null
                                                            },
                                                            {
                                                                "value": "id",
                                                                "quote_style": null
                                                            }
                                                        ]
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            ]
                        }
                    ],
                    "lateral_views": [],
                    "selection": {
                        "BinaryOp": {
                            "left": {
                                "Nested": {
                                    "BinaryOp": {
                                        "left": {
                                            "BinaryOp": {
                                                "left": {
                                                    "CompoundIdentifier": [
                                                        {
                                                            "value": "a",
                                                            "quote_style": null
                                                        },
                                                        {
                                                            "value": "name",
                                                            "quote_style": null
                                                        }
                                                    ]
                                                },
                                                "op": "Eq",
                                                "right": {
                                                    "Value": {
                                                        "SingleQuotedString": "bejing"
                                                    }
                                                }
                                            }
                                        },
                                        "op": "And",
                                        "right": {
                                            "BinaryOp": {
                                                "left": {
                                                    "CompoundIdentifier": [
                                                        {
                                                            "value": "a",
                                                            "quote_style": null
                                                        },
                                                        {
                                                            "value": "id",
                                                            "quote_style": null
                                                        }
                                                    ]
                                                },
                                                "op": "Lt",
                                                "right": {
                                                    "Value": {
                                                        "Number": [
                                                            "10",
                                                            false
                                                        ]
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            },
                            "op": "And",
                            "right": {
                                "BinaryOp": {
                                    "left": {
                                        "CompoundIdentifier": [
                                            {
                                                "value": "c",
                                                "quote_style": null
                                            },
                                            {
                                                "value": "conent",
                                                "quote_style": null
                                            }
                                        ]
                                    },
                                    "op": "Eq",
                                    "right": {
                                        "Value": {
                                            "SingleQuotedString": "abc"
                                        }
                                    }
                                }
                            }
                        }
                    },
                    "group_by": [],
                    "cluster_by": [],
                    "distribute_by": [],
                    "sort_by": [],
                    "having": null
                }
            },
            "order_by": [
                {
                    "expr": {
                        "CompoundIdentifier": [
                            {
                                "value": "c",
                                "quote_style": null
                            },
                            {
                                "value": "created_at",
                                "quote_style": null
                            }
                        ]
                    },
                    "asc": null,
                    "nulls_first": null
                },
                {
                    "expr": {
                        "CompoundIdentifier": [
                            {
                                "value": "p",
                                "quote_style": null
                            },
                            {
                                "value": "created_at",
                                "quote_style": null
                            }
                        ]
                    },
                    "asc": false,
                    "nulls_first": null
                }
            ],
            "limit": null,
            "offset": null,
            "fetch": null
        }
    }
];

export {complex_ast};
