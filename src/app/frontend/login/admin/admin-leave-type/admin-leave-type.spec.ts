import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminLeaveType } from './admin-leave-type';

describe('AdminLeaveType', () => {
  let component: AdminLeaveType;
  let fixture: ComponentFixture<AdminLeaveType>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminLeaveType]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AdminLeaveType);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
